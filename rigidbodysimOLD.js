/*
This file fills out RigidBodySimScene with a minimal but robust impulse solver
for a single cube colliding with an infinite plane using a single contact point
(the deepest-penetrating vertex). It includes:
- Continuous integration of linear & angular motion
- Contact detection (cube vertices vs. plane)
- Non-penetration using a velocity-level impulse + Baumgarte bias
- Restitution (bounce)
- Coulomb friction (static/kinetic) at the impulse level
- Simple position correction (positional slop)

Assumptions about Cube & Plane types (match your app's interfaces):
- Cube:
  - getMesh(): THREE.Mesh (orientation via .quaternion, position via .position)
  - getPosition()/setPosition(THREE.Vector3)
  - getVelocity()/setVelocity(THREE.Vector3)
  - getAngularVelocity()/setAngularVelocity(THREE.Vector3)
  - getMass(): number
  - getInertia(): THREE.Vector3 of principal moments in *body* frame (Ix, Iy, Iz)
  - getSize(): number (edge length)
- Plane:
  - getNormal(): THREE.Vector3 (unit length preferred)
  - getPoint(): THREE.Vector3 (any point on plane)

Notes:
- This is intentionally compact and single-contact; you can extend to multiple
  contacts and add an iterative PGS/GS solver later.
- Three.js is assumed to be available globally as THREE.
*/

class RigidBodySimScene {
    /**
     * Construct a simulation scene holding a single rigid cube above a static infinite plane.
     * The solver runs at a fixed timestep (dt) and applies gravity, detects/solves
     * one contact (deepest vertex vs plane), and integrates linear + angular motion.
     *
     * @param {Object} cube  - Your cube object implementing the interface described above.
     * @param {Object} plane - Your plane object implementing getNormal()/getPoint().
     */
    constructor(cube, plane) {
        this.cube = cube;
        this.plane = plane;

        // Fixed timestep integration (semi-implicit Euler) ~60 frames/second
        this.dt = 1 / 60; // ~60 Hz
        // Constant gravitational acceleration in world space (Y up)
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // Material/interaction parameters
        this.restitution = 0.05; // Coefficient of restitution: 0 = perfectly inelastic, 1 = perfectly elastic
        // Friction coefficients read from the cube (so per-object materials can differ)
        this.muS = cube.getStaticFriction(); // static friction coefficient (stick threshold)
        this.muK = cube.getKineticFriction(); // kinetic friction coefficient (sliding)

        // Constraint stabilization parameters (Baumgarte): push out small penetrations smoothly
        this.beta = 0.2; // Error reduction parameter (how aggressively to resolve penetration per time-step)
        this.penetrationSlop = 0.005; // Allow small interpenetration (meters) before applying correction

        // Passive damping to prevent unbounded energy growth and add realism
        this.linearDamping = 0.01; // scales down linear velocity a tiny bit each step
        this.angularDamping = 0.05; // scales down angular velocity a bit more than linear

        // Contact state tracking flags (for diagnostics/UX; not required for physics)
        this.inContact = false; // true when any vertex is at/under the plane
        this.loggingEnabled = false; // toggle to print error messages
        this.atrest = false; // optional external usage; not used internally here

        // Initial state setup:
        // - start 10 m above the plane
        // - zero linear velocity (will accelerate due to gravity)
        // - give a small random angular velocity so we see rotational effects
        this.cube.setPosition(new THREE.Vector3(0, 10, 0));
        this.cube.setVelocity(new THREE.Vector3(0, 0, 0));
        const randVel = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        );
        this.cube.setAngularVelocity(randVel);
    }

    // --- math helpers --------------------------------------------------------

    /**
     * Convert a quaternion to a 3x3 rotation matrix (THREE.Matrix3).
     * We go through Matrix4 because THREE provides a convenient helper for that path.
     * @param {THREE.Quaternion} q
     * @returns {THREE.Matrix3} rotation matrix
     */
    _quatToMatrix3(q) {
        const m = new THREE.Matrix3();
        m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        return m;
    }

    /**
     * Compute the inverse inertia tensor in *world* coordinates:
     * I_world^{-1} = R * I_body^{-1} * R^T
     * where R is the rotation from body to world.
     * @param {Object} cube
     * @returns {THREE.Matrix3} inverse world inertia tensor
     */
    _worldInertiaTensorInv(cube) {
        // Principal moments in body frame (diagonal inertia in body axes)
        const Ibody = cube.getInertia(); // THREE.Vector3 (Ix, Iy, Iz)

        // Build I_body^{-1} as a diagonal 3x3 matrix
        const ib = new THREE.Matrix3();
        ib.set(1 / Ibody.x, 0, 0, 0, 1 / Ibody.y, 0, 0, 0, 1 / Ibody.z);

        // Rotation matrix from current orientation
        const R = this._quatToMatrix3(cube.getMesh().quaternion);
        const Rt = new THREE.Matrix3().copy(R).transpose();

        // I_world^{-1} = R * I_body^{-1} * R^T (change of basis)
        const temp = new THREE.Matrix3().multiplyMatrices(R, ib);
        const Iinv = new THREE.Matrix3().multiplyMatrices(temp, Rt);
        return Iinv;
    }

    /**
     * Apply an impulse J at a world-space contact point.
     * Linear: v' = v + (J / m)
     * Angular: w' = w + I^{-1} (r × J), where r = contact - COM (world)
     *
     * @param {Object} cube
     * @param {THREE.Vector3} r        - vector from center of mass to contact (world)
     * @param {THREE.Vector3} impulse  - impulse to apply (world)
     * @param {THREE.Matrix3} Iinv     - inverse inertia tensor in world space
     */
    _applyImpulse(cube, r, impulse, Iinv) {
        const invMass = 1 / cube.getMass();

        // Update linear velocity by impulse / mass
        const v = cube.getVelocity().clone().addScaledVector(impulse, invMass);

        // Angular change: Δw = I^{-1} (r × J)
        const rXJ = new THREE.Vector3().copy(r).cross(impulse);

        // Multiply 3x3 matrix (Iinv) by vector (rXJ) "manually" using array elements.
        // THREE lacks a direct Matrix3 * Vector3 method, hence the explicit expansion.
        const rJ_arr = rXJ.toArray();
        const Iinv_elems = Iinv.toArray();
        const angDelta = new THREE.Vector3(
            Iinv_elems[0] * rJ_arr[0] +
                Iinv_elems[1] * rJ_arr[1] +
                Iinv_elems[2] * rJ_arr[2],
            Iinv_elems[3] * rJ_arr[0] +
                Iinv_elems[4] * rJ_arr[1] +
                Iinv_elems[5] * rJ_arr[2],
            Iinv_elems[6] * rJ_arr[0] +
                Iinv_elems[7] * rJ_arr[1] +
                Iinv_elems[8] * rJ_arr[2]
        );
        const w = cube.getAngularVelocity().clone().add(angDelta);

        // Commit both updated velocities back to the cube
        cube.setVelocity(v);
        cube.setAngularVelocity(w);
    }

    /**
     * Integrate free motion (no constraints) over dt using semi-implicit Euler:
     *   v_{t+dt} = v_t + a * dt
     *   x_{t+dt} = x_t + v_{t+dt} * dt
     * Rotational integration uses quaternion derivative from angular velocity.
     *
     * @param {Object} cube
     * @param {number} dt
     */
    _integrate(cube, dt) {
        // --- Linear integration ---
        // Apply gravity to linear velocity
        const v = cube.getVelocity().clone().addScaledVector(this.gravity, dt);
        // Apply small linear damping to mimic drag and stabilize sim
        v.multiplyScalar(1 - this.linearDamping);
        cube.setVelocity(v);

        // (Optional intermediate) Tangential component of velocity relative to plane normal,
        // currently computed but not used here. Left to illustrate decomposition.
        const n = this.plane.getNormal().clone().normalize();
        const v_tangent = v.clone().addScaledVector(n, -v.dot(n)); // not used later

        // Update world position by new velocity
        const x = cube.getPosition().clone().addScaledVector(v, dt);

        // Defensive programming: if user code ever yields NaN/Inf, reset to a safe spot
        if (!isFinite(x.x) || !isFinite(x.y) || !isFinite(x.z)) {
            if (this.loggingEnabled) {
                console.error('Invalid position detected:', x);
            }
            x.set(0, 2, 0); // safe fallback above the plane
        }

        cube.setPosition(x);

        // --- Angular integration ---
        // Apply small angular damping
        const w = cube.getAngularVelocity().clone();
        w.multiplyScalar(1 - this.angularDamping);
        cube.setAngularVelocity(w);

        // Update orientation quaternion from angular velocity
        // q' = q + 0.5 * [ω, 0] * q * dt, normalized for stability
        const q = cube.getMesh().quaternion.clone();
        const halfDt = 0.5 * dt;
        const wx = w.x,
            wy = w.y,
            wz = w.z;
        const dq = new THREE.Quaternion(
            wx * halfDt,
            wy * halfDt,
            wz * halfDt,
            0
        ).multiply(q);
        q.x += dq.x;
        q.y += dq.y;
        q.z += dq.z;
        q.w += dq.w;
        q.normalize(); // avoid drift due to numerical error
        cube.getMesh().quaternion.copy(q);

        // Keep the THREE.Mesh's position synchronized with the cube's logical position
        cube.getMesh().position.copy(x);
    }

    /**
     * Detect contact between the cube and the plane by:
     * 1) Transforming each of the 8 cube corners (from local to world).
     * 2) Computing signed distance φ = n·(x - p0) for each corner.
     * 3) Returning the *deepest* penetrating corner (φ <= 0 with most negative value).
     *
     * @returns {null|{normal:THREE.Vector3, point:THREE.Vector3, r:THREE.Vector3, depth:number}}
     *          null if no contact; otherwise contact data where:
     *            - normal is the plane normal (world),
     *            - point is the world-space corner position,
     *            - r is vector from COM to the contact point (world),
     *            - depth is positive penetration distance.
     */
    detectContact() {
        const n = this.plane.getNormal().clone().normalize(); // ensure unit normal
        const p0 = this.plane.getPoint(); // any point on plane

        // Half edge length of cube (assumes axis-aligned cube in local space)
        const half = 0.5 * this.cube.getSize();

        // 8 corners of a cube in local body coordinates
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

        // Build rotation-only transform from the cube's orientation
        const q = this.cube.getMesh().quaternion;
        const R4 = new THREE.Matrix4().makeRotationFromQuaternion(q);
        const R3 = new THREE.Matrix3().setFromMatrix4(R4);

        let deepest = null; // track the most negative signed distance (deepest penetration)
        const com = this.cube.getPosition(); // center of mass (also mesh position)

        for (const c of corners) {
            // rLocal: corner relative to cube local origin (COM in local frame)
            const rLocal = c.clone();
            // rWorld: rotate into world space (no translation; we'll add COM next)
            const rWorld = rLocal.applyMatrix3(R3);
            // World-space corner position
            const worldPt = com.clone().add(rWorld);

            // Signed distance to plane: φ(x) = n · (x - p0).
            // φ>0 above plane, φ=0 on plane, φ<0 penetrating (below plane).
            const phi = n.dot(new THREE.Vector3().subVectors(worldPt, p0));
            if (phi <= 0) {
                // corner is at or below plane (penetrating or touching)
                if (!deepest || phi < deepest.phi) {
                    // Keep the most negative φ we see
                    deepest = { point: worldPt, r: rWorld, phi };
                }
            }
        }

        // No corners under/at plane => no contact
        if (!deepest) return null;

        // Package useful contact info
        return {
            normal: n, // plane normal (world)
            point: deepest.point, // deepest corner position (world)
            r: deepest.r, // vector from COM to contact point (world)
            depth: -deepest.phi, // make depth positive (penetration magnitude)
        };
    }

    /**
     * Solve a single contact by computing and applying:
     *  - a normal impulse (non-penetration + restitution + Baumgarte bias)
     *  - a friction impulse (Coulomb model with static/kinetic switch)
     *
     * @param {Object} contact - result from detectContact()
     */
    _solveContactImpulse(contact) {
        const cube = this.cube;

        // Contact frame components
        const n = contact.normal.clone().normalize(); // contact normal (world)
        const r = contact.r.clone(); // COM -> contact (world)

        const invMass = 1 / cube.getMass();
        const Iinv = this._worldInertiaTensorInv(cube); // inverse inertia (world)

        // Relative velocity at contact point: v_c = v + ω × r
        const v = cube.getVelocity();
        const w = cube.getAngularVelocity();
        const vRel = v.clone().add(new THREE.Vector3().copy(w).cross(r));

        // Normal component of relative velocity (positive if separating)
        const vn = n.dot(vRel);

        // Effective mass along the normal direction (scalar):
        // K_n = 1/m + n · [ (I^{-1} (r × n)) × r ]
        const rxn = new THREE.Vector3().copy(r).cross(n);
        const rxn_arr = rxn.toArray();
        const Iinv_elems = Iinv.toArray();
        // temp = I^{-1} (r × n)
        const Iinv_rxn = new THREE.Vector3(
            Iinv_elems[0] * rxn_arr[0] +
                Iinv_elems[1] * rxn_arr[1] +
                Iinv_elems[2] * rxn_arr[2],
            Iinv_elems[3] * rxn_arr[0] +
                Iinv_elems[4] * rxn_arr[1] +
                Iinv_elems[5] * rxn_arr[2],
            Iinv_elems[6] * rxn_arr[0] +
                Iinv_elems[7] * rxn_arr[1] +
                Iinv_elems[8] * rxn_arr[2]
        );
        // K_n scalar assembly
        const K_n =
            invMass + n.dot(new THREE.Vector3().copy(Iinv_rxn).cross(r));

        // Velocity-level penetration correction (Baumgarte):
        // If we're more than the slop inside the plane, add a bias pushing us out.
        let bias = 0;
        const depth = contact.depth;
        if (depth > this.penetrationSlop) {
            // bias has units of velocity (m/s), scaled by beta and dt
            bias = (this.beta / this.dt) * (depth - this.penetrationSlop);
        }

        // Restitution (bounce): simple model that uses coefficient e.
        // We only add bounce if approaching the plane (vn < 0). The Math.min(vn, 0)
        // limits restitution to approaching contacts.
        const e = this.restitution;

        // Solve for scalar normal impulse jn.
        // Sign convention: a positive jn pushes along +n.
        let jn = -(vn + bias + e * Math.min(vn, 0)) / K_n;
        if (jn < 0) jn = 0; // never pull the objects together along the normal

        // Apply normal impulse Jn = jn * n
        const Jn = n.clone().multiplyScalar(jn);
        this._applyImpulse(cube, r, Jn, Iinv);

        // --- Friction solve (tangential) ---
        // Recompute relative velocity after normal impulse (since v and w changed)
        const v2 = cube.getVelocity();
        const w2 = cube.getAngularVelocity();
        const vRel2 = v2.clone().add(new THREE.Vector3().copy(w2).cross(r));

        // Tangential component: vt = vRel2 - (n·vRel2) n
        const vt = vRel2.clone().addScaledVector(n, -n.dot(vRel2));
        const speedT = vt.length();

        // If there is palpable tangential motion, try to cancel it with friction.
        if (speedT > 1e-6) {
            // Unit tangent direction (arbitrary within plane if multiple exist)
            const t = vt.clone().multiplyScalar(1 / speedT);

            // Effective mass along tangent:
            // K_t = 1/m + t · [ (I^{-1} (r × t)) × r ]
            const rxt = new THREE.Vector3().copy(r).cross(t);
            const rxt_arr = rxt.toArray();
            const Iinv_rxt = new THREE.Vector3(
                Iinv_elems[0] * rxt_arr[0] +
                    Iinv_elems[1] * rxt_arr[1] +
                    Iinv_elems[2] * rxt_arr[2],
                Iinv_elems[3] * rxt_arr[0] +
                    Iinv_elems[4] * rxt_arr[1] +
                    Iinv_elems[5] * rxt_arr[2],
                Iinv_elems[6] * rxt_arr[0] +
                    Iinv_elems[7] * rxt_arr[1] +
                    Iinv_elems[8] * rxt_arr[2]
            );
            const K_t =
                invMass + t.dot(new THREE.Vector3().copy(Iinv_rxt).cross(r));

            // Try to drive tangential velocity to zero: jt = -(t·vRel2) / K_t
            let jt = -t.dot(vRel2) / K_t;

            // Coulomb friction cone: |jt| <= μ * jn
            // crude mode selection: near-zero speed => try static, else kinetic
            const mu = speedT < 0.01 ? this.muS : this.muK;
            const maxFriction = mu * jn;
            jt = THREE.MathUtils.clamp(jt, -maxFriction, maxFriction);

            // Apply tangential impulse Jt = jt * t
            const Jt = t.multiplyScalar(jt);
            this._applyImpulse(cube, r, Jt, Iinv);
        }
    }

    /**
     * Advance the simulation by one fixed time step:
     * 1) Detect contact (deepest-penetrating vertex), if any.
     * 2) Apply a small positional correction for deep penetrations (pre-stabilization).
     * 3) Solve contact impulses (normal + friction) at the velocity level.
     * 4) Integrate unconstrained motion (gravity + rotation) with damping.
     */
    step() {
        const cube = this.cube;

        // 1) Broad/Narrow phase: single deepest contact (or null if none)
        const c = this.detectContact();

        // Update UI/diagnostic flag
        this.inContact = c !== null;

        // 2) Pre-stabilization: if the cube is significantly under the plane,
        // nudge it out so the impulse solver doesn’t need to fight large overlaps.
        if (c && c.depth > this.penetrationSlop) {
            const n = c.normal.clone().normalize();
            const correction = n.multiplyScalar(c.depth - this.penetrationSlop);
            const x = cube.getPosition().clone().add(correction);
            cube.setPosition(x);
            cube.getMesh().position.copy(x); // keep mesh in sync
        }

        // 3) Contact impulses (normal + friction) to prevent penetration and simulate friction
        if (c) {
            this._solveContactImpulse(c);
        }

        // 4) Integrate free motion for this timestep (gravity + orientation update)
        this._integrate(cube, this.dt);
    }
}
