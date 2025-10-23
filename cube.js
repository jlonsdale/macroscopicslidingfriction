// Cube class - handles cube creation and properties
class Cube {
    constructor(position, size, staticFriction, kineticFriction, mass) {
        this.velocity = new THREE.Vector3(0, 0, 0); // Initial velocity
        this.angularVelocity = new THREE.Vector3(0, 0, 0); // Initial angular velocity
        this.mass = mass; // Mass of the cube
        this.size = size; // Size of the cube

        // Calculate inertia tensor for a cube: I = (1/6) * m * a^2 for each axis
        // where m is mass and a is the edge length
        const I = (this.mass * size * size) / 6.0;
        this.inertia = new THREE.Vector3(I, I, I);

        this.staticFriction = staticFriction; // static friction coefficient
        this.kineticFriction = kineticFriction; // kinetic friction coefficient

        this.mesh = null;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshLambertMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.8,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
    }

    updatePosition(x, y, z) {
        if (this.mesh) {
            this.mesh.position.set(x, y, z);
        }
    }

    getMesh() {
        return this.mesh;
    }

    getPosition() {
        return this.mesh ? this.mesh.position.clone() : null;
    }

    getVelocity() {
        return this.velocity.clone();
    }

    getAngularVelocity() {
        return this.angularVelocity.clone();
    }

    getMass() {
        return this.mass;
    }

    getSize() {
        return this.size;
    }

    getInertia() {
        return this.inertia.clone();
    }

    setVelocity(velocity) {
        this.velocity.copy(velocity);
    }

    setPosition(position) {
        if (this.mesh) {
            this.mesh.position.copy(position);
        }
    }

    setAngularVelocity(angularVelocity) {
        this.angularVelocity.copy(angularVelocity);
    }

    setInertia(inertia) {
        this.inertia.copy(inertia);
    }

    setStaticFriction(muS) {
        this.staticFriction = muS;
    }
    setKineticFriction(muK) {
        this.kineticFriction = muK;
    }
    getStaticFriction() {
        return this.staticFriction;
    }
    getKineticFriction() {
        return this.kineticFriction;
    }
}
