class Plane {
    constructor(angle) {
        this.mesh = null;
        this.angle = angle; // degrees
        const geometry = new THREE.PlaneGeometry(50, 20);
        const material = new THREE.MeshLambertMaterial({
            color: 0x708090, // grey-blue (slate gray)
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
