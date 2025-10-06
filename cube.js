// Cube class - handles cube creation and properties
class Cube {
    constructor(position = new THREE.Vector3(0, 0, 0), size = 2) {
        this.velocity = new THREE.Vector3(0, 0, 0); // Initial velocity
        this.angularVelocity = new THREE.Vector3(0, 0, 0); // Initial angular velocity
        this.mass = 1; // Mass of the cube
        this.size = size; // Size of the cube

        // set this manually for now
        const muS = 0.6; // static friction coefficient
        const muK = 0.5; // kinetic friction coefficient
        this.muS = muS;
        this.muK = muK;

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
}
