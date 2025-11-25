// Camera Controls - handles orbit camera with pitch, yaw, and zoom
const threeCamera = new THREE.PerspectiveCamera(
    75, // Field of view
    window.innerWidth / window.innerHeight, // Aspect ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
);

class CameraControls {
    constructor(camera, renderer) {
        this.camera = camera;
        this.renderer = renderer;

        // Camera control settings
        this.distance = 18.659999999999997; // Initial distance from origin
        this.pitch = 32.74000000000001; // Vertical rotation (degrees)
        this.yaw = 35.5; // Horizontal rotation (degrees)
        this.target = new THREE.Vector3(0, 0, 0); // Look at target
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseSpeed = 0.5;
        this.zoomSpeed = 0.1;
        this.minDistance = 2;
        this.maxDistance = 50;
        this.minPitch = -89;
        this.maxPitch = 89;

        this.setupEventListeners();
        this.updateCameraPosition();
    }

    setupEventListeners() {
        //debugging print the camera settings:

        const canvas = this.renderer.domElement;

        // Mouse down event
        canvas.addEventListener('mousedown', event => {
            this.isDragging = true;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
            canvas.style.cursor = 'grabbing';
        });

        // Mouse move event
        canvas.addEventListener('mousemove', event => {
            if (!this.isDragging) return;

            const deltaX = event.clientX - this.lastMouseX;
            const deltaY = event.clientY - this.lastMouseY;

            // Update yaw (horizontal rotation)
            this.yaw -= deltaX * this.mouseSpeed;

            // Update pitch (vertical rotation)
            this.pitch -= deltaY * this.mouseSpeed;
            this.pitch = Math.max(
                this.minPitch,
                Math.min(this.maxPitch, this.pitch)
            );

            this.updateCameraPosition();

            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
        });

        // Mouse up event
        canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            canvas.style.cursor = 'grab';
        });

        // Mouse leave event
        canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            canvas.style.cursor = 'default';
        });

        // Mouse wheel event for zooming
        canvas.addEventListener('wheel', event => {
            event.preventDefault();

            const zoomDelta = event.deltaY * this.zoomSpeed;
            this.distance += zoomDelta;
            this.distance = Math.max(
                this.minDistance,
                Math.min(this.maxDistance, this.distance)
            );

            this.updateCameraPosition();
        });

        // Set initial cursor style
        canvas.style.cursor = 'grab';
    }

    updateCameraPosition() {
        // Convert spherical coordinates to cartesian
        const pitchRad = (this.pitch * Math.PI) / 180;
        const yawRad = (this.yaw * Math.PI) / 180;

        const x = this.distance * Math.cos(pitchRad) * Math.cos(yawRad);
        const y = this.distance * Math.sin(pitchRad);
        const z = this.distance * Math.cos(pitchRad) * Math.sin(yawRad);

        this.camera.position.set(
            this.target.x + x,
            this.target.y + y,
            this.target.z + z
        );
        this.camera.lookAt(this.target);
    }

    // Public API methods
    setTarget(x, y, z) {
        this.target.set(x, y, z);
        this.updateCameraPosition();
    }

    setDistance(distance) {
        this.distance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, distance)
        );
        this.updateCameraPosition();
    }

    setAngles(pitch, yaw) {
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, pitch));
        this.yaw = yaw;
        this.updateCameraPosition();
    }

    reset() {
        this.distance = 18.659999999999997;
        this.pitch = 32.74000000000001;
        this.yaw = 35.5;
        this.target.set(0, 0, 0);
        this.updateCameraPosition();
    }
}
