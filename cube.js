// Cube class - handles cube creation and properties
class Cube {
    constructor(
        startingPosition,
        startingVelocity,
        startingAngularVelocity,
        size,
        mass,
        texture = false
    ) {
        this.position = startingPosition; // THREE.Vector3
        this.velocity = startingVelocity; // THREE.Vector3
        this.angularVelocity = startingAngularVelocity; // THREE.Vector3

        this.mass = mass; // Mass of the cube
        this.size = size; // Size of the cube

        // Calculate inertia tensor for a cube: I = (1/6) * m * a^2 for each axis
        // where m is mass and a is the edge length
        const I = (this.mass * size * size) / 6.0;
        this.inertia = new THREE.Vector3(I, I, I);

        // Friction coefficients
        this.staticFriction = null;
        this.kineticFriction = null;

        this.material = null;

        this.texture = texture; // Store the texture parameter
        this.defaultColor = 0x0000ff; // Default blue color if no texture

        const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
        if (!texture) {
            this.material = new THREE.MeshLambertMaterial({
                color: this.defaultColor,
            });
        } else {
            this.material = new THREE.MeshLambertMaterial({
                map: texture,
                color: 0x0000ff,
            });
        }

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
    }

    getMesh() {
        return this.mesh;
    }

    getPosition() {
        return this.position.clone();
    }

    getVelocity() {
        return this.velocity.clone();
    }

    getAngularVelocity() {
        return this.angularVelocity.clone();
    }

    getInertia() {
        return this.inertia.clone();
    }

    setPosition(position) {
        this.position.copy(position);
        this.mesh.position.copy(position);
    }

    setVelocity(velocity) {
        this.velocity.copy(velocity);
    }

    setAngularVelocity(angularVelocity) {
        this.angularVelocity.copy(angularVelocity);
    }

    setInertia(inertia) {
        this.inertia.copy(inertia);
    }

    getMass() {
        return this.mass;
    }

    getSize() {
        return this.size;
    }

    getStaticFriction() {
        return this.staticFriction;
    }

    getKineticFriction() {
        return this.kineticFriction;
    }
}
