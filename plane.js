class Plane {
    constructor(angle) {
        this.mesh = null;
        this.angle = angle; // degrees
        const geometry = new THREE.PlaneGeometry(50, 20);
        const size = 512;
        const squares = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const squareSize = size / squares;

        for (let y = 0; y < squares; y++) {
            for (let x = 0; x < squares; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#9e93dbff' : '#3a3458ff';
                ctx.fillRect(
                    x * squareSize,
                    y * squareSize,
                    squareSize,
                    squareSize
                );
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
        });
        this.mesh = new THREE.Mesh(geometry, material);

        // Rotate plane to lie flat on XZ plane and then incline by angle
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.y += (angle * Math.PI) / 180;

        this.mesh.position.set(1, 0, 0);
        this.vertices = geometry.attributes.position.array;

        // Enable shadows
        this.mesh.receiveShadow = true;
    }

    getMesh() {
        return this.mesh;
    }

    getNormal() {
        // Calculate normal vector based on angle
        const angleRad = (this.angle * Math.PI) / 180;
        const normal = new THREE.Vector3(
            Math.sin(angleRad),
            Math.cos(angleRad),
            0
        );
        return normal.normalize();
    }

    getAngle() {
        return this.angle;
    }

    getPoint() {
        // A point on the plane (we use the mesh position)
        return this.mesh.position.clone();
    }
}
