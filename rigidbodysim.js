// CUBE:
/**
 * Cube class important properties:
 * - velocity: THREE.Vector3, linear velocity of the cube
 * - angularVelocity: THREE.Vector3, rotational velocity of the cube
 * - mass: Number, mass of the cube
 * - size: Number, size of the cube (edge length)
 * - muS: Number, static friction coefficient
 * - muK: Number, kinetic friction coefficient
 * - mesh: THREE.Mesh, the Three.js mesh representing the cube
 */

class RigidBodySimScene {
    constructor(cube, plane) {
        this.cube = cube;
        this.plane = plane;

        this.dt = 0.016; // ~60 FPS
        this.gravity = new THREE.Vector3(0, -9.81, 0); // m/s^2

        // Friction coefficients (tweak as you like)
        this.muS = 0.6; // static
        this.muK = 0.5; // kinetic
        this.staticSpeedEps = 1e-3; // threshold to consider "not moving" tangentially

        // working vectors to avoid allocations
        this._FResultant = new THREE.Vector3();
        this._Fg = new THREE.Vector3();
        this._Fnormal = new THREE.Vector3();
        this._Ffriction = new THREE.Vector3(); // friction force
        this._tmp1 = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();

        // Start state
        this.cube.setPosition(new THREE.Vector3(0, 5, 0));
        this.cube.setVelocity(new THREE.Vector3(0, 0, 0));
    }

    // Build all forces acting on the cube this frame (gravity, normal, friction)
    computeForces() {
        const m = this.cube.getMass();
        const pos = this.cube.getPosition().clone();
        const vel = this.cube.getVelocity().clone();

        // Reset totals
        this._FResultant.set(0, 0, 0);
        this._Fg.copy(this.gravity).multiplyScalar(m);
        this._FResultant.add(this._Fg);

        // Contact geometry
        const n = this.plane.getNormal().clone().normalize();
        const p0 = this.plane.getPoint();
        const half = this.cube.getSize() / 2;

        // signed distance from cube center to plane
        const dist = n.dot(this._tmp1.copy(pos).sub(p0));
        const penetration = half - dist; // > 0 means overlapping
        const contactSlop = 1e-4;

        // Assume no contact initially
        this._Fnormal.set(0, 0, 0);
        this._Ffriction.set(0, 0, 0);

        if (penetration > -contactSlop) {
            // --- Normal force balances ONLY the inward normal component of Fg
            const Fg_n = this._Fg.dot(n); // component along normal
            const Nmag = Math.max(0, -Fg_n); // never pull
            this._Fnormal.copy(n).multiplyScalar(Nmag);
            this._FResultant.add(this._Fnormal);

            // --- Positional correction (push out of plane if overlapping)
            if (penetration > 0) {
                pos.add(
                    this._tmp1.copy(n).multiplyScalar(penetration + contactSlop)
                );
                this.cube.setPosition(pos);
            }

            // --- Remove incoming normal velocity (non-bouncy contact)
            const v_n = vel.dot(n);
            if (v_n < 0) {
                vel.add(this._tmp1.copy(n).multiplyScalar(-v_n));
                this.cube.setVelocity(vel);
            }

            // ---------- FRICTION ----------
            // Tangential velocity (project vel onto plane)
            const v_t = this._tmp1
                .copy(vel)
                .sub(n.clone().multiplyScalar(vel.dot(n)));
            const v_t_speed = v_t.length();

            // Tangential component of the *other* forces (Fnet currently = Fg + Fn)
            const Ft = this._tmp2
                .copy(this._FResultant)
                .sub(n.clone().multiplyScalar(this._FResultant.dot(n))); // remove normal part
            const Ft_mag = Ft.length();

            if (v_t_speed < this.staticSpeedEps && Ft_mag <= this.muS * Nmag) {
                // --- STATIC FRICTION: exactly cancels tangential force
                this._Ffriction.copy(Ft).multiplyScalar(-1);
                // Clamp tangential velocity to zero so it truly comes to rest
                this.cube.setVelocity(vel.sub(v_t));
            } else if (v_t_speed > 0) {
                // --- KINETIC FRICTION: opposes motion with magnitude mu_k * N
                this._Ffriction
                    .copy(v_t)
                    .multiplyScalar(-1 / v_t_speed) // -t_hat
                    .multiplyScalar(this.muK * Nmag);
            }
            this._FResultant.add(this._Ffriction);
            // ---------- end friction ----------
        }
    }

    // Semi-implicit (symplectic) Euler integration using FORCES
    integrate() {
        const m = this.cube.getMass();
        const vel = this.cube.getVelocity().clone();
        const pos = this.cube.getPosition().clone();

        // v += (Fnet/m) * dt
        vel.add(this._FResultant.clone().multiplyScalar(this.dt / m));
        this.cube.setVelocity(vel);

        // x += v * dt
        pos.add(vel.clone().multiplyScalar(this.dt));
        this.cube.setPosition(pos);
    }

    step() {
        this.computeForces();
        this.integrate();
    }
}
