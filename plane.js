class Plane {
    constructor() {
        this.mesh = null;
        const geometry = new THREE.PlaneGeometry(20, 10);
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
                ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);

        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(0, 0, 0);

        // Enable shadows
        this.mesh.receiveShadow = true;
    }

    getMesh() {
        return this.mesh;
    }

    rotateby45() {
        this.mesh.rotation.y += Math.PI / 4;
    }
}