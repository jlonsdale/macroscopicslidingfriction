class Plane {
    constructor(angle, texture, width, height) {
        this.mesh = null;
        this.angle = angle; // degrees
        this.texture = texture; // Store the texture parameter

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            color: 0xffffff, // White to let texture show through
        });

        this.mesh = new THREE.Mesh(geometry, material);
        // Remove the blue color override that was preventing texture from showing
        // this.mesh.material.color = new THREE.Color(0x0000ff);

        // Rotate plane to lie flat on XZ plane and then incline by angle
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.y += (angle * Math.PI) / 180;

        this.mesh.position.set(1, 0, 0);

        // Enable shadows
        this.mesh.receiveShadow = true;
        this.getMesh();
    }

    getMesh() {
        if (!this.mesh) return null;

        // Apply to material (preserve other material props)
        this.mesh.material.map = this.texture;
        this.mesh.material.needsUpdate = true;

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
