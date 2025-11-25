// Math helper functions
function deg2rad(degrees) {
    return degrees * (Math.PI / 180);
}

function rad2deg(radians) {
    return radians * (180 / Math.PI);
}

const BIRDSEYE = true;

class Scene3D {
    constructor() {
        //Threejs shit
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.container = null;
        this.cameraControls = null;

        //Objects
        this.cube = null;
        this.plane = null;

        this.CubeSurfaceParams = {
            amplitude: 0.5,
            wavelength: 25,
            noise: 0.4,
            rotation: deg2rad(90),
            bins: 100,
        };

        this.PlaneSurfaceParams = {
            amplitude: 0.5,
            wavelength: 25,
            noise: 0.4,
            rotation: deg2rad(90),
            bins: 100,
        };

        this.rigidBodySim = null;

        this.init();
    }

    init() {
        // Get container
        this.container = document.getElementById('canvas-container');

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(5.0, 5.0, 5.0);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Enable shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Add renderer to container
        this.container.appendChild(this.renderer.domElement);

        // Setup lighting
        this.setupLighting();

        // Add resize listener
        window.addEventListener('resize', () => this.onWindowResize());

        // Setup camera controls with specific starting conditions
        this.cameraControls = new CameraControls(this.camera, this.renderer);

        if (BIRDSEYE) {
            // Set camera parameters to match specification
            this.cameraControls.distance = 40;
            this.cameraControls.pitch = 90;
            this.cameraControls.yaw = 450;
            this.cameraControls.target.set(0, 0, 0);
            this.cameraControls.updateCameraPosition();
        }

        let CubeSurface = new Surface(
            this.CubeSurfaceParams.amplitude,
            this.CubeSurfaceParams.wavelength,
            this.CubeSurfaceParams.noise,
            this.CubeSurfaceParams.rotation,
            this.CubeSurfaceParams.bins
        );

        let PlaneSurface = new Surface(
            this.PlaneSurfaceParams.amplitude,
            this.PlaneSurfaceParams.wavelength,
            this.PlaneSurfaceParams.noise,
            this.PlaneSurfaceParams.rotation,
            this.PlaneSurfaceParams.bins
        );

        console.log('CubeSurface:', CubeSurface);
        console.log('PlaneSurface:', PlaneSurface);

        this.friction = new Friction(CubeSurface, PlaneSurface, 3.0);

        // Add a Cube and Plane:
        this.cube = new Cube(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            5,
            10,
            CubeSurface.texture
        );
        this.plane = new Plane(0, 50, 50, PlaneSurface.texture);

        this.addObject(this.plane.getMesh());
        this.addObject(this.cube.getMesh());

        this.rigidBodySim = new GSRigidBodySim(
            this.cube,
            this.plane,
            this.friction
        );

        // Create a small graph in the corner for directional profile
        createDirectionalProfileGraph();
        updateDirectionalProfileGraph(this.friction.directionalProfile());

        // Setup keyboard controls
        this.setupKeyboardControls();

        // Start render loop
        this.animate();
    }

    setupLighting() {
        // Ambient light - provides overall illumination
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);

        // Directional light - acts like sunlight, casts shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;

        // Configure shadow properties
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;

        this.scene.add(directionalLight);

        // Hemisphere light for natural sky-ground lighting
        const hemisphereLight = new THREE.HemisphereLight(
            0x87ceeb,
            0x8b4513,
            0.2
        );
        this.scene.add(hemisphereLight);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.rigidBodySim.step();
        this.renderer.render(this.scene, this.camera);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // Utility methods for adding objects to scene
    addObject(object) {
        this.scene.add(object);
    }

    removeObject(object) {
        this.scene.remove(object);
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getRenderer() {
        return this.renderer;
    }

    // Keyboard controls for adding speed in x and z directions
    setupKeyboardControls() {
        document.addEventListener('keydown', event => {
            if (event.key.toLowerCase() === 'w') {
                // Add speed in z direction (forward)
                const speedBoost = 10.0;
                this.cube.velocity.z = -speedBoost;
            }
            if (event.key.toLowerCase() === 's') {
                // Add speed in z direction (backward)
                const speedBoost = 10.0;
                this.cube.velocity.z = speedBoost;
            }
            if (event.key.toLowerCase() === 'd') {
                // Add speed in x direction (right)
                const speedBoost = 10.0;
                this.cube.velocity.x = speedBoost;
            }
            if (event.key.toLowerCase() === 'a') {
                // Add speed in x direction (left)
                const speedBoost = 10.0;
                this.cube.velocity.x = -speedBoost;
            }
            if (event.key.toLowerCase() === 'c') {
                this.cameraControls.printCameraDetails();
            }
        });
    }
}

Scene3D.prototype.setupControls = function () {
    setupKeyboardControls(this);
};

// Initialize scene when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scene3D = new Scene3D();
});
