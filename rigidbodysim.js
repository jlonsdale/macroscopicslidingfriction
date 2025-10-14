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
    constructor(cube, plane) {
        this.cube = cube;
        this.plane = plane;

        this.dt = 1 / 60; // ~60 Hz
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // Material params
        this.restitution = 0.05; // 0 = inelastic, 1 = perfectly elastic
        this.muS = cube.getStaticFriction(); // static friction coefficient
        this.muK = cube.getKineticFriction(); // kinetic friction coefficient

        // Stabilization (Baumgarte) and slop
        this.beta = 0.2; // error reduction parameter [0..1]
        this.penetrationSlop = 0.005; // meters of allowed penetration before correcting

        // Damping and sleep parameters
        this.linearDamping = 0.01; // Linear velocity damping (air resistance)
        this.angularDamping = 0.05; // Angular velocity damping (rotational friction)

        // Contact state tracking
        this.inContact = false; // Boolean to track if cube is in contact with plane
        this.loggingEnabled = false; // Boolean to control console logging
        this.atrest = false; // Boolean to track if cube is at rest

        // Start state
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

    _applyImpulse(cube, r, impulse, Iinv) {
        // r: vector from COM to contact (world)
        const invMass = 1 / cube.getMass();

        // Linear velocity
        const v = cube.getVelocity().clone().addScaledVector(impulse, invMass);

        // Angular velocity: ω' = ω + I^{-1} (r × J)
        const rXJ = new THREE.Vector3().copy(r).cross(impulse);

        // multiply Iinv * (r × J)
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

        cube.setVelocity(v);
        cube.setAngularVelocity(w);
    }

    _integrate(cube, dt) {
        // Semi-implicit Euler: v_{t+dt} = v_t + dt * a; x_{t+dt} = x_t + dt * v_{t+dt}
        const v = cube.getVelocity().clone().addScaledVector(this.gravity, dt);
        // apply slight damping
        v.multiplyScalar(1 - this.linearDamping);
        cube.setVelocity(v);

        const n = this.plane.getNormal().clone().normalize();
        const v_tangent = v.clone().addScaledVector(n, -v.dot(n));

        const x = cube.getPosition().clone().addScaledVector(v, dt);

        // Validate position is not NaN or Infinity
        if (!isFinite(x.x) || !isFinite(x.y) || !isFinite(x.z)) {
            if (this.loggingEnabled) {
                console.error('Invalid position detected:', x);
            }
            x.set(0, 2, 0); // Reset to safe position
        }

        cube.setPosition(x);

        // Orientation from angular velocity
        const w = cube.getAngularVelocity().clone();
        // apply slight angular damping
        w.multiplyScalar(1 - this.angularDamping);
        cube.setAngularVelocity(w);

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
        q.normalize();
        cube.getMesh().quaternion.copy(q);

        // Keep mesh position in sync in case cube.setPosition doesn't
        cube.getMesh().position.copy(x);
    }

    // Return deepest penetrating vertex contact with the plane (or null)
    detectContact() {
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
        const R4 = new THREE.Matrix4().makeRotationFromQuaternion(q);
        const R3 = new THREE.Matrix3().setFromMatrix4(R4);

        let deepest = null;
        const com = this.cube.getPosition();

        for (const c of corners) {
            const rLocal = c.clone();
            const rWorld = rLocal.applyMatrix3(R3); // orientation only
            const worldPt = com.clone().add(rWorld);

            // signed distance from plane: φ(x) = n·(x - p0)
            const phi = n.dot(new THREE.Vector3().subVectors(worldPt, p0));
            if (phi <= 0) {
                if (!deepest || phi < deepest.phi) {
                    deepest = { point: worldPt, r: rWorld, phi };
                }
            }
        }

        if (!deepest) return null;

        return {
            normal: n, // plane normal
            point: deepest.point, // contact point on cube (world)
            r: deepest.r, // from COM to contact (world)
            depth: -deepest.phi, // positive penetration depth
        };
    }

    // Compute and apply normal + friction impulses for one contact
    _solveContactImpulse(contact) {
        const cube = this.cube;
        const n = contact.normal.clone().normalize();
        const r = contact.r.clone();

        const invMass = 1 / cube.getMass();
        const Iinv = this._worldInertiaTensorInv(cube);

        // Relative velocity at contact: v_c = v + ω × r
        const v = cube.getVelocity();
        const w = cube.getAngularVelocity();
        const vRel = v.clone().add(new THREE.Vector3().copy(w).cross(r));

        const vn = n.dot(vRel); // normal component

        // Effective mass along normal: K_n = 1/m + n·[(I^{-1} ((r×n)) × r)]
        const rxn = new THREE.Vector3().copy(r).cross(n);
        const rxn_arr = rxn.toArray();
        const Iinv_elems = Iinv.toArray();
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
        const K_n =
            invMass + n.dot(new THREE.Vector3().copy(Iinv_rxn).cross(r));

        // Baumgarte bias for penetration correction at velocity level
        let bias = 0;
        const depth = contact.depth;
        if (depth > this.penetrationSlop) {
            bias = (this.beta / this.dt) * (depth - this.penetrationSlop);
        }

        // Restitution only if separating speed is high enough and contact just happened; here we keep it simple
        const e = this.restitution;

        // Normal impulse (clamped to be non-negative)
        let jn = -(vn + bias + e * Math.min(vn, 0)) / K_n;
        if (jn < 0) jn = 0;

        const Jn = n.clone().multiplyScalar(jn);
        this._applyImpulse(cube, r, Jn, Iinv);

        // --- Friction ---
        // Recompute vRel after normal impulse
        const v2 = cube.getVelocity();
        const w2 = cube.getAngularVelocity();
        const vRel2 = v2.clone().add(new THREE.Vector3().copy(w2).cross(r));

        const vt = vRel2.clone().addScaledVector(n, -n.dot(vRel2)); // tangential velocity
        const speedT = vt.length();

        if (speedT > 1e-6) {
            const t = vt.clone().multiplyScalar(1 / speedT); // unit tangent (any direction in tangent plane)

            // Effective mass along t: K_t = 1/m + t·[(I^{-1} ((r×t)) × r)]
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

            let jt = -t.dot(vRel2) / K_t; // try to kill tangential velocity

            // Coulomb: |jt| <= μ * jn
            const mu = speedT < 0.01 ? this.muS : this.muK; // crude stick/slide switch
            const maxFriction = mu * jn;
            jt = THREE.MathUtils.clamp(jt, -maxFriction, maxFriction);

            const Jt = t.multiplyScalar(jt);
            this._applyImpulse(cube, r, Jt, Iinv);
        }
    }

    step() {
        // Skip simulation if cube is at rest
        const cube = this.cube;

        // 1) Broad/Narrow phase: one deepest contact (if any)
        const c = this.detectContact();

        // Update contact state
        this.inContact = c !== null;

        // 2) Pre-stabilize position a bit to avoid exploding when starting deep inside
        if (c && c.depth > this.penetrationSlop) {
            const n = c.normal.clone().normalize();
            const correction = n.multiplyScalar(c.depth - this.penetrationSlop);
            const x = cube.getPosition().clone().add(correction);
            cube.setPosition(x);
            cube.getMesh().position.copy(x);
        }

        // 3) Solve contact at the velocity level via impulses (normal + friction)
        if (c) {
            this._solveContactImpulse(c);
        }

        // 4) Integrate free motion (gravity, orientation)
        this._integrate(cube, this.dt);
    }
}
