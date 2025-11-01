class Plane {
    constructor(angle, texAngle) {
        console.log(texAngle);
        this.mesh = null;
        this.angle = angle; // degrees
        this.textureRotation = texAngle; // Store current texture rotation
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
        this.getMesh(texAngle);
    }

    // Return the mesh and optionally apply a stripey canvas texture rotated by `angleDeg`
    // Usage: plane.getMesh(); // no texture rotation (uses stored rotation)
    //        plane.getMesh(45); // apply stripes rotated 45 degrees
    getMesh(angleDeg = null) {
        if (!this.mesh) return null;

        // Use provided angle or stored texture rotation
        const rotationAngle =
            angleDeg !== null ? angleDeg : this.textureRotation;

        // Store the rotation angle for future use
        if (angleDeg !== null) {
            this.textureRotation = angleDeg;
        }

        // Create a stripey canvas texture
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Stripe settings
        const stripeCount = 40; // number of stripes across the texture
        const stripeWidth = size / stripeCount;

        // Colors for stripes (use mesh material color as one of the colors)
        const baseColor = this.mesh.material.color
            ? `#${this.mesh.material.color.getHexString()}`
            : '#708090';
        const altColor = '#ffffff';

        // Draw vertical stripes
        for (let i = 0; i < stripeCount; i++) {
            ctx.fillStyle = i % 2 === 0 ? baseColor : altColor;
            ctx.fillRect(i * stripeWidth, 0, stripeWidth, size);
        }

        // Create THREE texture from canvas
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);
        // rotate around texture center
        tex.center.set(0.5, 0.5);
        tex.rotation = (rotationAngle * Math.PI) / 180;
        tex.needsUpdate = true;

        // Apply to material (preserve other material props)
        this.mesh.material.map = tex;
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

    getTextureRotation() {
        return this.textureRotation;
    }

    setTextureRotation(angleDeg) {
        this.textureRotation = angleDeg;
        // Update the mesh with new texture rotation
        this.getMesh(angleDeg);
    }

    getPoint() {
        // A point on the plane (we use the mesh position)
        return this.mesh.position.clone();
    }
}
