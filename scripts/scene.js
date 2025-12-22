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
        this.cubeSurface = null;

        this.PlaneSurfaceParams = {
            amplitude: 0.5,
            wavelength: 25,
            noise: 0.4,
            rotation: deg2rad(90),
            bins: 100,
        };
        this.planeSurface = null;

        this.friction = null;

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

        this.cubeSurface = new Surface(
            this.CubeSurfaceParams.amplitude,
            this.CubeSurfaceParams.wavelength,
            this.CubeSurfaceParams.noise,
            this.CubeSurfaceParams.rotation,
            this.CubeSurfaceParams.bins
        );

        this.planeSurface = new Surface(
            this.PlaneSurfaceParams.amplitude,
            this.PlaneSurfaceParams.wavelength,
            this.PlaneSurfaceParams.noise,
            this.PlaneSurfaceParams.rotation,
            this.PlaneSurfaceParams.bins
        );

        this.friction = new Friction(this.cubeSurface, this.planeSurface, 5.0);

        // Add a Cube and Plane:
        this.cube = new Cube(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            5,
            100,
            this.cubeSurface.texture
        );
        this.plane = new Plane(0, 50, 50, this.planeSurface.texture);

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

    // Setup velocity input controls
    setupKeyboardControls() {
        // Handle arrow key navigation in velocity input fields
        document.addEventListener('keydown', event => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.type === 'number') {
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    const currentValue = parseFloat(activeElement.value) || 0;
                    activeElement.value = (
                        currentValue + parseFloat(activeElement.step)
                    ).toFixed(1);
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    const currentValue = parseFloat(activeElement.value) || 0;
                    activeElement.value = (
                        currentValue - parseFloat(activeElement.step)
                    ).toFixed(1);
                }
                if (event.key === 'Enter') {
                    applyVelocity();
                }
            }

            // Camera controls
            if (event.key.toLowerCase() === 'c') {
                this.cameraControls.printCameraDetails();
            }
        });

        // Add input validation for velocity fields
        ['velocityX', 'velocityY', 'velocityZ'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', function () {
                    // Only allow numbers and decimal points
                    this.value = this.value.replace(/[^-0-9.]/g, '');
                });
            }
        });
    }
}

// Global functions for velocity control
function applyVelocity() {
    let cube = window?.scene3D?.cube;

    const x = parseFloat(document.getElementById('velocityX').value) || 0;
    const y = parseFloat(document.getElementById('velocityY').value) || 0;
    const z = parseFloat(document.getElementById('velocityZ').value) || 0;

    if (cube) {
        window.scene3D.cube.setVelocity(new THREE.Vector3(x, y, z));
    }

    // Get cube's current local X direction and use it to update surface rotation
    const localXDirection = cube.getLocalXDirection();
    const rotationAngle = Math.atan2(localXDirection.z, localXDirection.x);

    // Update cube surface rotation
    window.scene3D.cubeSurface.rotateSurface(rotationAngle);

    // Recreate friction object with updated surface to ensure directional profile updates
    window.scene3D.friction = new Friction(
        window.scene3D.cubeSurface,
        window.scene3D.planeSurface,
        5.0
    );

    // Update directional profile graph
    updateDirectionalProfileGraph(window.scene3D.friction.directionalProfile());
}

function resetVelocity() {
    document.getElementById('velocityX').value = '0';
    document.getElementById('velocityY').value = '0';
    document.getElementById('velocityZ').value = '0';

    if (window.scene3D && window.scene3D.cube) {
        window.scene3D.cube.setVelocity(new THREE.Vector3(0, 0, 0));
        window.scene3D.cube.setAngularVelocity(new THREE.Vector3(0, 0, 0));
    }
}

Scene3D.prototype.setupControls = function () {
    setupKeyboardControls(this);
};

// Initialize scene when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scene3D = new Scene3D();
});
