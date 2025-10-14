/*
RigidBodySimScene — single cube vs. infinite plane with impulse-based contact,
extended to a multi-contact **sequential impulse (Gauss–Seidel / PGS)** solver.

WHAT'S INCLUDED
- Continuous integration of linear & angular motion (semi-implicit Euler)
- Contact detection: all 8 cube vertices tested against plane
- Non-penetration via normal impulses with Baumgarte bias + positional slop
- Restitution (optional in GS loop, see notes)
- Coulomb friction in the impulse domain using a 2D tangent basis (t1, t2)
- Sequential impulses (Gauss–Seidel) over all contacts with warm starting
- Backwards-compatible single-contact detectContact() kept (returns deepest only)

ASSUMPTIONS (match your app's interfaces):
- Cube:
  - getMesh(): THREE.Mesh (orientation via .quaternion, position via .position)
  - getPosition()/setPosition(THREE.Vector3)
  - getVelocity()/setVelocity(THREE.Vector3)
  - getAngularVelocity()/setAngularVelocity(THREE.Vector3)
  - getMass(): number
  - getInertia(): THREE.Vector3 of principal moments in *body* frame (Ix, Iy, Iz)
  - getSize(): number (edge length)
  - getStaticFriction(): number
  - getKineticFriction(): number
- Plane:
  - getNormal(): THREE.Vector3 (unit length preferred)
  - getPoint(): THREE.Vector3 (any point on plane)

NOTES
- This is still a minimalist real-time solver; numerical tricks (bias, slop, damping)
  are intentionally used for stability.
- For stacks/heavy contact scenarios consider increasing iterations, enabling warm start,
  and possibly substepping the solver.
- Tangent basis is 2D (t1, t2) to approximate isotropic friction in the plane.
- Restitution inside a GS loop can destabilize stacks; by default we set the restitution
  term to zero in the loop (see _solveContactsGS()) and recommend handling bounce only
  on clear impacts (e.g., when first touching with significant approach speed).
*/

class RigidBodySimScene {
    /**
     * Construct a simulation scene holding a single rigid cube above a static infinite plane.
     * The solver runs at a fixed timestep (dt) and applies gravity, detects/solves
     * multiple contacts (all vertices touching/penetrating), and integrates motion.
     */
    constructor(cube, plane) {
        this.cube = cube;
        this.plane = plane;

        // Fixed timestep ~60 Hz
        this.dt = 1 / 60;
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // Material params
        this.restitution = 0.05; // 0 = inelastic, 1 = perfectly elastic
        this.muS = cube.getStaticFriction(); // static friction coefficient
        this.muK = cube.getKineticFriction(); // kinetic friction coefficient

        // Stabilization (Baumgarte) and slop
        this.beta = 0.2; // error reduction parameter [0..1]
        this.penetrationSlop = 0.005; // meters allowed before correcting

        // Damping
        this.linearDamping = 0.01;
        this.angularDamping = 0.05;

        // Solver tuning
        this.gsIterations = 12; // 8–20 typical
        this.warmStartEnabled = true; // persist impulses across frames
        this.maxPreCorrectionContacts = 4; // cap position nudges to avoid over-correction

        // State flags
        this.inContact = false;
        this.loggingEnabled = false;
        this.atrest = false;

        // Warm-start cache (from previous frame). We match by approximate r vector.
        this._prevContacts = []; // each: { r: THREE.Vector3, lambda_n, lambda_t1, lambda_t2 }

        // Start state
        this.cube.setPosition(new THREE.Vector3(0, 10, 0));
        this.cube.setVelocity(new THREE.Vector3(0, 0, 0));
        this.cube.setAngularVelocity(new THREE.Vector3(0, 0, 0));
    }

    // --- math helpers --------------------------------------------------------

    _quatToMatrix3(q) {
        const m = new THREE.Matrix3();
        m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        return m;
    }

    _worldInertiaTensorInv(cube) {
        // I_world^{-1} = R * I_body^{-1} * R^T
        const Ibody = cube.getInertia(); // THREE.Vector3 principal moments
        const ib = new THREE.Matrix3();
        ib.set(1 / Ibody.x, 0, 0, 0, 1 / Ibody.y, 0, 0, 0, 1 / Ibody.z);
        const R = this._quatToMatrix3(cube.getMesh().quaternion);
        const Rt = new THREE.Matrix3().copy(R).transpose();
        const temp = new THREE.Matrix3().multiplyMatrices(R, ib);
        const Iinv = new THREE.Matrix3().multiplyMatrices(temp, Rt);
        return Iinv;
    }

    _mat3MulVec3(M, v) {
        // Helper: THREE.Matrix3 (row-major in toArray) times THREE.Vector3
        const a = M.toArray();
        return new THREE.Vector3(
            a[0] * v.x + a[1] * v.y + a[2] * v.z,
            a[3] * v.x + a[4] * v.y + a[5] * v.z,
            a[6] * v.x + a[7] * v.y + a[8] * v.z
        );
    }

    _applyImpulse(cube, r, impulse, Iinv) {
        // Apply linear: v' = v + J/m
        const invMass = 1 / cube.getMass();
        const v = cube.getVelocity().clone().addScaledVector(impulse, invMass);

        // Apply angular: w' = w + I^{-1}(r × J)
        const rXJ = new THREE.Vector3().copy(r).cross(impulse);
        const angDelta = this._mat3MulVec3(Iinv, rXJ);
        const w = cube.getAngularVelocity().clone().add(angDelta);

        cube.setVelocity(v);
        cube.setAngularVelocity(w);
    }

    _integrate(cube, dt) {
        // Semi-implicit Euler with small damping
        const v = cube.getVelocity().clone().addScaledVector(this.gravity, dt);
        v.multiplyScalar(1 - this.linearDamping);
        cube.setVelocity(v);

        const x = cube.getPosition().clone().addScaledVector(v, dt);
        if (!isFinite(x.x) || !isFinite(x.y) || !isFinite(x.z)) {
            if (this.loggingEnabled)
                console.error('Invalid position detected:', x);
            x.set(0, 2, 0);
        }
        cube.setPosition(x);

        const w = cube.getAngularVelocity().clone();
        w.multiplyScalar(1 - this.angularDamping);
        cube.setAngularVelocity(w);

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
        cube.getMesh().quaternion.copy(q);
        cube.getMesh().position.copy(x);
    }

    // ---------------- contact generation (multi) -----------------------------

    /**
     * Collect ALL contacts (one per vertex that is at or below the plane).
     * Returns array of contact objects with fields filled/initialized.
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
            const r = c.clone().applyMatrix3(R3); // local corner rotated into world
            const worldPt = com.clone().add(r); // point in world
            const phi = n.dot(new THREE.Vector3().subVectors(worldPt, p0));
            if (phi <= 0) {
                contacts.push({
                    n: n.clone(),
                    r,
                    point: worldPt,
                    depth: -phi,
                    // Will be set in precompute:
                    t1: null,
                    t2: null,
                    K_n: 0,
                    K_t1: 0,
                    K_t2: 0,
                    bias: 0,
                    // Accumulated impulses (warm starting):
                    lambda_n: 0,
                    lambda_t1: 0,
                    lambda_t2: 0,
                });
            }
        }
        return contacts;
    }

    /**
     * Backwards-compatible helper: returns only the deepest contact or null.
     * (Kept for reference/testing; GS path uses _collectContacts instead.)
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

    // ---------------- GS solver building blocks ------------------------------

    _precomputeContacts(contacts, Iinv, invMass) {
        const dt = this.dt;
        for (const c of contacts) {
            const n = c.n;

            // Relative velocity at contact to choose a "meaningful" tangent
            const vRel = this.cube
                .getVelocity()
                .clone()
                .add(
                    new THREE.Vector3()
                        .copy(this.cube.getAngularVelocity())
                        .cross(c.r)
                );
            const vt = vRel.clone().addScaledVector(n, -n.dot(vRel));

            let t1;
            if (vt.lengthSq() > 1e-12) {
                t1 = vt.normalize();
            } else {
                // Pick any vector not parallel to n, then Gram–Schmidt
                t1 =
                    Math.abs(n.y) < 0.9
                        ? new THREE.Vector3(0, 1, 0)
                        : new THREE.Vector3(1, 0, 0);
                t1.sub(n.clone().multiplyScalar(t1.dot(n))).normalize();
            }
            const t2 = new THREE.Vector3().copy(n).cross(t1).normalize();
            c.t1 = t1;
            c.t2 = t2;

            // Effective mass along a direction dir: K = 1/m + dir · [ (I^{-1}(r×dir)) × r ]
            const Kdir = dir => {
                const rxd = new THREE.Vector3().copy(c.r).cross(dir);
                const Iinv_rxd = this._mat3MulVec3(Iinv, rxd);
                return (
                    invMass +
                    dir.dot(new THREE.Vector3().copy(Iinv_rxd).cross(c.r))
                );
            };
            c.K_n = Kdir(n);
            c.K_t1 = Kdir(t1);
            c.K_t2 = Kdir(t2);

            // Baumgarte bias (velocity units)
            c.bias =
                c.depth > this.penetrationSlop
                    ? (this.beta / dt) * (c.depth - this.penetrationSlop)
                    : 0;
        }
    }

    _matchWarmStart(contacts) {
        // Copy lambdas from last frame by nearest r (within tolerance)
        if (!this.warmStartEnabled || !this._prevContacts.length) return;
        const tolSq = 1e-6; // ~1 mm in r space depending on scale
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

    _solveContactsGS(contacts, Iinv) {
        const cube = this.cube;

        for (let it = 0; it < this.gsIterations; ++it) {
            for (const c of contacts) {
                // --- normal ---
                let v = cube.getVelocity();
                let w = cube.getAngularVelocity();
                let vRel = v
                    .clone()
                    .add(new THREE.Vector3().copy(w).cross(c.r));
                const vn = c.n.dot(vRel);

                // Restitution is typically omitted in GS loops for resting contacts.
                // If you want bounce on clear impacts, add it only when vn is sufficiently negative
                // AND on the first iteration, otherwise set to 0.
                const restitutionTerm = 0; // or: (it === 0 && vn < -0.2 ? this.restitution * Math.min(vn, 0) : 0);

                let dLambda_n = -(vn + c.bias + restitutionTerm) / c.K_n;
                const lambda_n_new = Math.max(c.lambda_n + dLambda_n, 0); // nonnegative
                dLambda_n = lambda_n_new - c.lambda_n;
                c.lambda_n = lambda_n_new;
                if (dLambda_n !== 0) {
                    const Jn = c.n.clone().multiplyScalar(dLambda_n);
                    this._applyImpulse(cube, c.r, Jn, Iinv);
                }

                // --- friction t1 ---
                v = cube.getVelocity();
                w = cube.getAngularVelocity();
                vRel = v.clone().add(new THREE.Vector3().copy(w).cross(c.r));
                const vt1 = c.t1.dot(vRel);
                let dLambda_t1 = -vt1 / c.K_t1;

                // Static cone test: maximum = μ_s * lambda_n; if exceeded => kinetic (μ_k)
                const maxStatic = this.muS * c.lambda_n;
                let lambda_t1_candidate = c.lambda_t1 + dLambda_t1;
                let maxF = maxStatic;
                if (Math.abs(lambda_t1_candidate) > maxStatic)
                    maxF = this.muK * c.lambda_n;

                const lambda_t1_new = THREE.MathUtils.clamp(
                    c.lambda_t1 + dLambda_t1,
                    -maxF,
                    +maxF
                );
                dLambda_t1 = lambda_t1_new - c.lambda_t1;
                c.lambda_t1 = lambda_t1_new;
                if (dLambda_t1 !== 0) {
                    const Jt1 = c.t1.clone().multiplyScalar(dLambda_t1);
                    this._applyImpulse(cube, c.r, Jt1, Iinv);
                }

                // --- friction t2 ---
                v = cube.getVelocity();
                w = cube.getAngularVelocity();
                vRel = v.clone().add(new THREE.Vector3().copy(w).cross(c.r));
                const vt2 = c.t2.dot(vRel);
                let dLambda_t2 = -vt2 / c.K_t2;

                let lambda_t2_candidate = c.lambda_t2 + dLambda_t2;
                maxF =
                    Math.abs(lambda_t2_candidate) > maxStatic
                        ? this.muK * c.lambda_n
                        : maxStatic;

                const lambda_t2_new = THREE.MathUtils.clamp(
                    c.lambda_t2 + dLambda_t2,
                    -maxF,
                    +maxF
                );
                dLambda_t2 = lambda_t2_new - c.lambda_t2;
                c.lambda_t2 = lambda_t2_new;
                if (dLambda_t2 !== 0) {
                    const Jt2 = c.t2.clone().multiplyScalar(dLambda_t2);
                    this._applyImpulse(cube, c.r, Jt2, Iinv);
                }
            }
        }
    }

    // ---------------- main step ----------------------------------------------

    step() {
        const cube = this.cube;
        const invMass = 1 / cube.getMass();
        const Iinv = this._worldInertiaTensorInv(cube);

        // 1) Collect all contacts at/below plane
        const contacts = this._collectContacts();
        this.inContact = contacts.length > 0;

        // 2) Small positional pre-correction to avoid large overlaps (cap number)
        // Distribute correction across contacts to avoid excessive push.
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

        // 3) Precompute per-contact data: tangents, K's, bias
        this._precomputeContacts(contacts, Iinv, invMass);

        // 4) Warm start: copy lambdas from previous frame & apply them
        this._matchWarmStart(contacts);
        this._warmStartApply(contacts, Iinv);

        // 5) Gauss–Seidel (sequential impulses) over contacts
        if (contacts.length) {
            this._solveContactsGS(contacts, Iinv);
        }

        // Cache lambdas for next frame warm starting
        this._prevContacts = contacts.map(c => ({
            r: c.r.clone(),
            lambda_n: c.lambda_n,
            lambda_t1: c.lambda_t1,
            lambda_t2: c.lambda_t2,
        }));

        // 6) Integrate free motion
        this._integrate(cube, this.dt);
    }
}
