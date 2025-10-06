// Cube class - handles cube creation and properties
class Cube {
    constructor(position = new THREE.Vector3(0, 0, 0), size = 2) {
        this.mesh = null

        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x00ff88,
            transparent: true,
            opacity: 0.8
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
    

}