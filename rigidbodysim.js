// This is at the start of the simulation
// We have 1 cube and 1 plane
// cube has position, velocity, angular velocity, mass, size
// plane has angle of inclination

class RigidBodySimScene {
    constructor(cube, plane) {
        this.angleofinclination = plane.angle; // degrees
        this.cube = cube;
        this.plane = plane;
        this.dt = 0.016; // Time step (~60 FPS)

        // Gravity acceleration vector (m/s^2)
        this.gravity = new THREE.Vector3(0, -9.81, 0);

        // Physics constants
        this.restitution = 0.6; // Bounce coefficient (0 = no bounce, 1 = perfect bounce)
        this.friction = 0.3; // Surface friction coefficient
        this.angularDamping = 0.98; // Angular velocity damping

        // Calculate plane normal from rotation
        this.planeNormal = this.plane.getNormal();

        // Get cube size for collision bounds
        this.cubeSize = this.cube.size;
    }

    step() {}
}
