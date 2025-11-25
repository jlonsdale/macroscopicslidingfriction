class Plane {
    constructor(angle, width, height, texture = false) {

        //SETTINGS
        const ARROWS = true;


        this.mesh = null;
        this.angle = angle; // degrees
        this.material = null;

        this.texture = texture; // Store the texture parameter
        this.defaultColor = 0x888888; // Default gray color if no texture

        const geometry = new THREE.PlaneGeometry(width, height);
        
        if (!texture) {
            this.material = new THREE.MeshLambertMaterial({ color: this.defaultColor });
        }
        else {
            this.material = new THREE.MeshLambertMaterial({
            map: texture,
            color: 0x00ff88, // White to let texture show through
        });
        }

        this.mesh = new THREE.Mesh(geometry, this.material);
            
        // Make a plane to lie flat on XZ plane and then incline by angle
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.y += (angle * Math.PI) / 180;
        this.mesh.position.set(0, 0, 0);
        if (ARROWS) {
            // Create arrow helper pointing in positive X direction
            this.arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0), // direction (positive X)
            new THREE.Vector3(0, 0, 0), // origin
            11, // length
            0xff0000 // color (red)
            );
            this.mesh.add(this.arrowHelper);
               // Create arrow helper pointing in positive Y direction
            this.arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0), // direction (positive Y)
            new THREE.Vector3(0, 0, 0), // origin
            11, // length
            0x0000ff // color (blue)
            );
            this.mesh.add(this.arrowHelper);
        }

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
