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

        // create a canvas-based stripe texture and keep it on the instance
        const stripeSize = 512;
        const canvas = document.createElement('canvas');
        canvas.width = stripeSize;
        canvas.height = stripeSize;
        const ctx = canvas.getContext('2d');

        // draw horizontal stripe pattern (rotated 90 degrees from vertical)
        const stripes = 8;
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#00aa88';
            ctx.fillRect(
                0,
                (i * stripeSize) / stripes,
                stripeSize,
                stripeSize / stripes
            );
        }

        const stripeTexture = new THREE.CanvasTexture(canvas);
        stripeTexture.wrapS = stripeTexture.wrapT = THREE.RepeatWrapping;
        stripeTexture.repeat.set(1, 1);
        this.stripeTexture = stripeTexture;

        // Patch MeshLambertMaterial once so materials created below without an explicit map get the stripe texture.
        // This avoids changing the later material creation lines.
        if (!THREE.MeshLambertMaterial.__stripePatched) {
            const _OriginalMeshLambert = THREE.MeshLambertMaterial;
            const stripeTexRef = stripeTexture; // capture in closure
            THREE.MeshLambertMaterial = function (params) {
                params = Object.assign({}, params);
                if (!params.map) params.map = stripeTexRef;
                return new _OriginalMeshLambert(params);
            };
            // keep prototype so instanceof checks still work
            THREE.MeshLambertMaterial.prototype =
                _OriginalMeshLambert.prototype;
            THREE.MeshLambertMaterial.__stripePatched = true;
        }
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
