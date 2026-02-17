class GSRigidBodySim {
    /**
     * Rigid-body simulation for a single cube on a static plane.
     * Uses fixed-timestep integration, multi-contact detection (all cube
     * vertices), and a Projected Gauss-Seidel (sequential impulse) solver
     * with Baumgarte stabilisation and warm starting.
     *
     * @param {Cube}     cube     - The dynamic rigid body.
     * @param {Plane}    plane    - The static collision surface.
     * @param {Friction} friction - Direction-dependent friction model.
     */
    constructor(cube, plane, friction) {
        this.cube = cube;
        this.plane = plane;
        this.friction = friction;

        // Time & gravity
        this.dt = 1 / 60; // fixed timestep (~60 Hz)
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // Material
        this.restitution = 0.05; // coefficient of restitution [0, 1]

        // Baumgarte stabilisation
        this.beta = 0.1; // error-reduction parameter [0, 1]
        this.penetrationSlop = 0.005; // allowed overlap before correction (m)

        // Velocity damping
        this.linearDamping = 0.01;
        this.angularDamping = 0.01;

        // Solver tuning
        this.gsIterations = 15; // PGS iterations per frame (8-20 typical)
        this.warmStartEnabled = true; // reuse impulses across frames
        this.maxPreCorrectionContacts = 4; // cap positional nudges per step
        this.minEffectiveMass = 1e-8; // guard against division by zero

        // Runtime state
        this.inContact = false;
        this.loggingEnabled = false;
        this.atrest = false;

        // Warm-start cache: matched by approximate r-vector each frame
        this._prevContacts = [];
    }

    // ── Maths helpers ─────────────────────────────────────────────────────

    /** Convert a quaternion to a 3×3 rotation matrix. */
    _quatToMatrix3(q) {
        const m = new THREE.Matrix3();
        m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        return m;
    }

    /** Compute the world-space inverse inertia tensor: I_world⁻¹ = R · I_body⁻¹ · Rᵀ */
    _worldInertiaTensorInv(cube) {
        const Ibody = cube.getInertia();
        const ib = new THREE.Matrix3();
        ib.set(
            this._safeReciprocal(Ibody.x),
            0,
            0,
            0,
            this._safeReciprocal(Ibody.y),
            0,
            0,
            0,
            this._safeReciprocal(Ibody.z)
        );
        const R = this._quatToMatrix3(cube.getMesh().quaternion);
        const Rt = new THREE.Matrix3().copy(R).transpose();
        const temp = new THREE.Matrix3().multiplyMatrices(R, ib);
        const Iinv = new THREE.Matrix3().multiplyMatrices(temp, Rt);
        return Iinv;
    }

    /** Return 1/value, or 0 if value is near-zero. */
    _safeReciprocal(value) {
        return Math.abs(value) > this.minEffectiveMass ? 1 / value : 0;
    }

    /** Return numerator/denominator, or 0 if denominator is near-zero. */
    _safeDivide(numerator, denominator) {
        return Math.abs(denominator) > this.minEffectiveMass
            ? numerator / denominator
            : 0;
    }

    /** Inverse mass of a body (safe against zero-mass). */
    _getInvMass(cube) {
        return this._safeReciprocal(cube.getMass());
    }

    /** Multiply a Matrix3 by a Vector3 (THREE stores elements column-major in toArray). */
    _mat3MulVec3(M, v) {
        const a = M.toArray();
        return new THREE.Vector3(
            a[0] * v.x + a[1] * v.y + a[2] * v.z,
            a[3] * v.x + a[4] * v.y + a[5] * v.z,
            a[6] * v.x + a[7] * v.y + a[8] * v.z
        );
    }

    /**
     * Apply a linear + angular impulse to the body.
     * Linear:  v' = v + J / m
     * Angular: ω' = ω + I⁻¹ (r × J)
     */
    _applyImpulse(cube, r, impulse, Iinv) {
        const invMass = this._getInvMass(cube);
        const v = cube.getVelocity().clone().addScaledVector(impulse, invMass);

        const rXJ = new THREE.Vector3().copy(r).cross(impulse);
        const angDelta = this._mat3MulVec3(Iinv, rXJ);
        const w = cube.getAngularVelocity().clone().add(angDelta);

        cube.setVelocity(v);
        cube.setAngularVelocity(w);
    }

    /**
     * Semi-implicit Euler integration with linear/angular damping.
     * Updates position, orientation, and syncs the Three.js mesh.
     */
    _integrate(cube, dt) {
        // Velocity: apply gravity then damp
        const v = cube.getVelocity().clone().addScaledVector(this.gravity, dt);
        v.multiplyScalar(1 - this.linearDamping);
        cube.setVelocity(v);

        // Position: advance by new velocity; reset on NaN to prevent runaway
        const x = cube.getPosition().clone().addScaledVector(v, dt);
        if (!isFinite(x.x) || !isFinite(x.y) || !isFinite(x.z)) {
            x.set(0, 2, 0);
        }
        cube.setPosition(x);

        // Angular velocity: damp
        const w = cube.getAngularVelocity().clone();
        w.multiplyScalar(1 - this.angularDamping);
        cube.setAngularVelocity(w);

        // Orientation: quaternion derivative dq = ½ · [ω, 0] · q
        const q = cube.getMesh().quaternion.clone();
        const halfDt = 0.5 * dt;
        const dq = new THREE.Quaternion(
            w.x * halfDt,
            w.y * halfDt,
            w.z * halfDt,
            0
        ).multiply(q);
        q.x += dq.x;
        q.y += dq.y;
        q.z += dq.z;
        q.w += dq.w;
        q.normalize();

        // Sync mesh transform
        cube.getMesh().quaternion.copy(q);
        cube.getMesh().position.copy(x);
    }

    // ── Contact generation ───────────────────────────────────────────────

    /**
     * Test every cube vertex against the plane and return a contact
     * descriptor for each vertex that is at or below the surface.
     *
     * @returns {Array<Object>} Contacts with normal, r-vector, projected
     *          point, penetration depth, and zeroed impulse accumulators.
     */
    _collectContacts() {
        const contacts = [];
        const n = this.plane.getNormal().clone().normalize();
        const p0 = this.plane.getPoint();

        const half = 0.5 * this.cube.getSize();
        const corners = [
            new THREE.Vector3(half, half, half),
            new THREE.Vector3(half, half, -half),
            new THREE.Vector3(half, -half, half),
            new THREE.Vector3(half, -half, -half),
            new THREE.Vector3(-half, half, half),
            new THREE.Vector3(-half, half, -half),
            new THREE.Vector3(-half, -half, half),
            new THREE.Vector3(-half, -half, -half),
        ];

        const q = this.cube.getMesh().quaternion;
        const R3 = this._quatToMatrix3(q);
        const com = this.cube.getPosition();

        for (const c of corners) {
            const r = c.clone().applyMatrix3(R3); // body-space → world offset
            const worldPt = com.clone().add(r); // world-space vertex position
            const phi = n.dot(new THREE.Vector3().subVectors(worldPt, p0)); // signed distance

            if (phi <= 0) {
                // Project penetrating vertex onto the plane surface
                const projectedPt = worldPt.clone().addScaledVector(n, -phi);

                // Only keep contacts within the finite plane bounds
                if (this.plane.isOnPlane(projectedPt)) {
                    contacts.push({
                        n: n.clone(), // contact normal (plane → cube)
                        r, // world offset from COM to vertex
                        point: projectedPt, // contact point on the plane surface
                        depth: -phi, // penetration depth (positive)
                        t1: null, // tangent basis (set in precompute)
                        t2: null,
                        K_n: 0, // effective masses (set in precompute)
                        K_t1: 0,
                        K_t2: 0,
                        bias: 0, // Baumgarte bias velocity
                        lambda_n: 0, // accumulated impulses (normal + friction)
                        lambda_t1: 0,
                        lambda_t2: 0,
                    });
                }
            }
        }
        return contacts;
    }

    /**
     * Return the single deepest contact, or null if no contact exists.
     * Convenience wrapper kept for external callers; the solver itself
     * uses _collectContacts() for multi-contact resolution.
     */
    detectContact() {
        const all = this._collectContacts();
        if (!all.length) return null;
        let deepest = all[0];
        for (let i = 1; i < all.length; ++i)
            if (all[i].depth > deepest.depth) deepest = all[i];
        return {
            normal: deepest.n,
            point: deepest.point,
            r: deepest.r,
            depth: deepest.depth,
        };
    }

    // ── Gauss-Seidel solver ──────────────────────────────────────────────

    /**
     * Fill in derived per-contact quantities needed by the solver:
     *   - Tangent basis (t1, t2) aligned with the sliding velocity direction
     *   - Effective mass scalars (K_n, K_t1, K_t2)
     *   - Baumgarte bias velocity for penetration recovery
     */
    _precomputeContacts(contacts, Iinv, invMass) {
        const dt = this.dt;
        for (const c of contacts) {
            const n = c.n;

            // Tangential velocity at contact (used to orient the friction basis)
            const vRel = this.cube
                .getVelocity()
                .clone()
                .add(
                    new THREE.Vector3()
                        .copy(this.cube.getAngularVelocity())
                        .cross(c.r)
                );
            const vt = vRel.clone().addScaledVector(n, -n.dot(vRel));

            // t1: align with sliding direction when possible, otherwise Gram-Schmidt
            let t1;
            if (vt.lengthSq() > 1e-12) {
                t1 = vt.normalize();
            } else {
                t1 =
                    Math.abs(n.y) < 0.9
                        ? new THREE.Vector3(0, 1, 0)
                        : new THREE.Vector3(1, 0, 0);
                t1.sub(n.clone().multiplyScalar(t1.dot(n))).normalize();
            }
            // t2: completes the orthonormal contact basis
            const t2 = new THREE.Vector3().copy(n).cross(t1).normalize();
            c.t1 = t1;
            c.t2 = t2;

            // Effective mass: K = 1/m + dir · [(I⁻¹(r × dir)) × r]
            const effectiveMass = direction => {
                const rxd = new THREE.Vector3().copy(c.r).cross(direction);
                const Iinv_rxd = this._mat3MulVec3(Iinv, rxd);
                return (
                    invMass +
                    direction.dot(new THREE.Vector3().copy(Iinv_rxd).cross(c.r))
                );
            };
            c.K_n = effectiveMass(n);
            c.K_t1 = effectiveMass(t1);
            c.K_t2 = effectiveMass(t2);

            // Baumgarte bias: velocity-level correction for penetration beyond slop
            c.bias =
                c.depth > this.penetrationSlop
                    ? (this.beta / dt) * (c.depth - this.penetrationSlop)
                    : 0;
        }
    }

    /** Transfer accumulated impulses from the previous frame's closest matching contact. */
    _matchWarmStart(contacts) {
        if (!this.warmStartEnabled || !this._prevContacts.length) return;
        const tolSq = 1e-6; // squared distance threshold for matching r-vectors
        for (const c of contacts) {
            let best = null,
                bestD = Infinity;
            for (const p of this._prevContacts) {
                const d = c.r.distanceToSquared(p.r);
                if (d < bestD) {
                    bestD = d;
                    best = p;
                }
            }
            if (best && bestD <= tolSq) {
                c.lambda_n = best.lambda_n;
                c.lambda_t1 = best.lambda_t1;
                c.lambda_t2 = best.lambda_t2;
            }
        }
    }

    /** Apply the warm-started impulses to seed the solver closer to the solution. */
    _warmStartApply(contacts, Iinv) {
        if (!this.warmStartEnabled) return;
        for (const c of contacts) {
            if (!c) continue;
            const J = c.n
                .clone()
                .multiplyScalar(c.lambda_n)
                .add(c.t1.clone().multiplyScalar(c.lambda_t1))
                .add(c.t2.clone().multiplyScalar(c.lambda_t2));
            this._applyImpulse(this.cube, c.r, J, Iinv);
        }
    }

    /**
     * Projected Gauss-Seidel (sequential impulse) solver.
     * Iterates over all contacts, resolving normal non-penetration first,
     * then anisotropic Coulomb friction along both tangent axes.
     *
     * @param {Array<Object>}  contacts - Contacts with precomputed basis and effective masses.
     * @param {THREE.Matrix3}  Iinv     - World-space inverse inertia tensor.
     */
    _solveContactsGS(contacts, Iinv) {
        const body = this.cube;

        // Below this squared speed the sliding direction is treated as zero
        const SLIDING_EPS_SQ = 0.1;

        for (let it = 0; it < this.gsIterations; ++it) {
            for (const c of contacts) {
                // Relative velocity at the contact point: vRel = v + ω × r
                const getContactRelVel = () => {
                    const v = body.getVelocity();
                    const w = body.getAngularVelocity();
                    return v
                        .clone()
                        .add(new THREE.Vector3().copy(w).cross(c.r));
                };

                // 1) Normal constraint (non-penetration)
                {
                    const vRel = getContactRelVel();
                    const vn = c.n.dot(vRel);

                    // Δλ_n = -(vn + bias) / K_n, clamped so λ_n >= 0 (no adhesion)
                    let dLambdaN = this._safeDivide(-(vn + c.bias), c.K_n);
                    const lambdaNNew = Math.max(c.lambda_n + dLambdaN, 0);
                    dLambdaN = lambdaNNew - c.lambda_n;
                    c.lambda_n = lambdaNNew;

                    if (dLambdaN !== 0) {
                        const Jn = c.n.clone().multiplyScalar(dLambdaN);
                        this._applyImpulse(body, c.r, Jn, Iinv);
                    }
                }

                // 2) Anisotropic friction coefficients
                const vRelForFriction = getContactRelVel();

                // Tangential (sliding) velocity: remove normal component
                const vSliding = vRelForFriction
                    .clone()
                    .addScaledVector(c.n, -c.n.dot(vRelForFriction));

                // Sliding direction angle in the XZ plane (zero when nearly stationary)
                let slidingAngle = 0;
                if (vSliding.lengthSq() > SLIDING_EPS_SQ) {
                    slidingAngle = Math.atan2(vSliding.z, vSliding.x);
                }

                // Static μ uses a 1.3× angle scale (heuristic wider static cone)
                const muS = this.friction.getMuAtAngle(
                    Math.abs(slidingAngle * 1.3)
                );
                const muK = this.friction.getMuAtAngle(Math.abs(slidingAngle));

                // Maximum static friction force (based on current normal impulse)
                const maxStatic = muS * c.lambda_n;

                // 3) Friction along t1 (boxed Coulomb: static/kinetic switch)
                {
                    const vRel = getContactRelVel();
                    const vt1 = c.t1.dot(vRel);

                    let dLambdaT1 = this._safeDivide(-vt1, c.K_t1);

                    // Switch to kinetic limit if candidate exceeds static threshold
                    const lambdaT1Candidate = c.lambda_t1 + dLambdaT1;
                    const maxF =
                        Math.abs(lambdaT1Candidate) > maxStatic
                            ? muK * c.lambda_n
                            : maxStatic;

                    // Clamp to friction cone box [-maxF, +maxF]
                    const lambdaT1New = THREE.MathUtils.clamp(
                        lambdaT1Candidate,
                        -maxF,
                        +maxF
                    );

                    dLambdaT1 = lambdaT1New - c.lambda_t1;
                    c.lambda_t1 = lambdaT1New;

                    if (dLambdaT1 !== 0) {
                        const Jt1 = c.t1.clone().multiplyScalar(dLambdaT1);
                        this._applyImpulse(body, c.r, Jt1, Iinv);
                    }
                }

                // 4) Friction along t2 (same boxed Coulomb logic as t1)
                {
                    const vRel = getContactRelVel();
                    const vt2 = c.t2.dot(vRel);

                    let dLambdaT2 = this._safeDivide(-vt2, c.K_t2);

                    const lambdaT2Candidate = c.lambda_t2 + dLambdaT2;
                    const maxF =
                        Math.abs(lambdaT2Candidate) > maxStatic
                            ? muK * c.lambda_n
                            : maxStatic;

                    const lambdaT2New = THREE.MathUtils.clamp(
                        lambdaT2Candidate,
                        -maxF,
                        +maxF
                    );

                    dLambdaT2 = lambdaT2New - c.lambda_t2;
                    c.lambda_t2 = lambdaT2New;

                    if (dLambdaT2 !== 0) {
                        const Jt2 = c.t2.clone().multiplyScalar(dLambdaT2);
                        this._applyImpulse(body, c.r, Jt2, Iinv);
                    }
                }
            }
        }
    }

    // ── Simulation step ─────────────────────────────────────────────────

    /** Advance the simulation by one fixed timestep. */
    step() {
        const cube = this.cube;
        const invMass = this._getInvMass(cube);
        const Iinv = this._worldInertiaTensorInv(cube);

        // 1) Detect contacts (every vertex at or below the plane)
        let contacts = this._collectContacts();
        this.inContact = contacts.length > 0;

        // 2) Positional pre-correction: push the body out of deep overlaps,
        //    distributing the correction evenly across contacts (capped).
        let corrected = 0;
        for (const c of contacts) {
            if (corrected >= this.maxPreCorrectionContacts) break;
            if (c.depth > this.penetrationSlop) {
                const corr = c.n
                    .clone()
                    .multiplyScalar(
                        (c.depth - this.penetrationSlop) /
                            Math.min(
                                contacts.length,
                                this.maxPreCorrectionContacts
                            )
                    );
                const x = cube.getPosition().clone().add(corr);
                cube.setPosition(x);
                cube.getMesh().position.copy(x);
                corrected++;
            }
        }

        // Recompute contacts after correction so the solver uses fresh geometry
        if (corrected > 0) {
            contacts = this._collectContacts();
            this.inContact = contacts.length > 0;
        }

        // 3) Precompute tangent basis, effective masses, and Baumgarte bias
        this._precomputeContacts(contacts, Iinv, invMass);

        // 4) Warm-start: seed solver with impulses from the previous frame
        this._matchWarmStart(contacts);
        this._warmStartApply(contacts, Iinv);

        // 5) PGS solve: iteratively resolve normal + friction constraints
        if (contacts.length) {
            this._solveContactsGS(contacts, Iinv);
        }

        // 6) Cache impulses for next-frame warm starting
        this._prevContacts = contacts.map(c => ({
            r: c.r.clone(),
            lambda_n: c.lambda_n,
            lambda_t1: c.lambda_t1,
            lambda_t2: c.lambda_t2,
        }));

        // 7) Integrate velocity and position (semi-implicit Euler)
        this._integrate(cube, this.dt);
    }
}
