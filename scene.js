// ================================================================
// MACROSCOPIC SLIDING FRICTION - SCENE MANAGEMENT
// ================================================================
// File Structure:
// 1. SceneRenderer Class - Main 3D scene and physics management
// 2. Global State Management - Application state variables
// 4. Scene Utility Functions - Helper functions for scene operations
// 5. Application Initialization - Setup and startup code
// 6. UI Event Handlers - User interface interaction management
// ================================================================

// ================================================================
// SCENE RENDERER CLASS - Main 3D Scene Management
// ================================================================

// Surface properties for individual surfaces
const Surface1Properties = {
    amplitude: 5,
    wavelength: 10,
    noise: 1,
    rotation: 2,
    height: 500,
    width: 500,
    bins: 100,
    anisotropic: true,
};

const Surface2Properties = {
    amplitude: 5,
    wavelength: 10,
    noise: 1,
    rotation: 2,
    height: 500,
    width: 500,
    bins: 100,
    anisotropic: true,
};

class SceneRenderer {
    constructor() {
        this.initializeProperties();
        this.initializeScene();
        this.setupEventHandlers();
        this.animate();
    }

    // ================================================================
    // PROPERTY INITIALIZATION
    // ================================================================

    initializeProperties() {
        // Scene properties
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cube = null;
        this.cubetex = null;
        this.plane = null;
        this.planetexangle = 0;
        this.cameraControls = null;
        this.rigidBodySim = null;
        this.startingAngle = 15;

        // Physics properties
        this.staticFriction = 0.6;
        this.kineticFriction = 0.5;
        this.mass = 5;

        // State properties
        this.logging = false;
        this.paused = false;

        // Friction Engine
        this.surface1 = new Surface(
            Surface1Properties.amplitude,
            Surface1Properties.wavelength,
            Surface1Properties.noise,
            (Surface1Properties.rotation * Math.PI) / 180, // Convert degrees to radians
            Surface1Properties.height,
            Surface1Properties.width,
            Surface1Properties.bins,
            Surface1Properties.anisotropic
        );
        this.surface2 = new Surface(
            Surface2Properties.amplitude,
            Surface2Properties.wavelength,
            Surface2Properties.noise,
            (Surface2Properties.rotation * Math.PI) / 180, // Convert degrees to radians
            Surface2Properties.height,
            Surface2Properties.width,
            Surface2Properties.bins,
            Surface2Properties.anisotropic
        );
        this.tex1 = this.surface1.texture;

        this.tex2 = this.surface2.texture;

        this.friction = new Friction(this.surface1, this.surface2);
    }

    initializeScene() {
        this.setupRenderer();
        this.addLights();
        this.addSceneObjects();
        this.setupCameraControls();
        this.setupPhysics();
    }

    setupEventHandlers() {
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    // ================================================================
    // RENDERER AND SCENE SETUP
    // ================================================================

    setupRenderer() {
        try {
            this.scene = new THREE.Scene();
            this.camera = threeCamera;
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x222222, 1);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            const container = document.getElementById('container');
            container.appendChild(this.renderer.domElement);
        } catch (error) {
            this.showError('Failed to initialize Three.js: ' + error.message);
        }
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 30, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
    }

    addSceneObjects() {
        this.addPlane();
        this.addCube(this.staticFriction, this.kineticFriction);
    }

    setupCameraControls() {
        this.cameraControls = new CameraControls(this.camera, this.renderer);
    }

    setupPhysics() {
        this.rigidBodySim = new RigidBodySimScene(this.cube, this.plane);
    } // ================================================================
    // SCENE OBJECT MANAGEMENT
    // ================================================================

    addPlane() {
        const plane = new Plane(this.startingAngle, this.tex2);
        this.plane = plane;
        const planeMesh = plane.getMesh();
        this.scene.add(planeMesh);
    }

    addCube(staticFriction, kineticFriction) {
        const startingPosition = new THREE.Vector3(-5, 10, 0);
        const size = 4;
        const cube = new Cube(
            startingPosition,
            size,
            staticFriction,
            kineticFriction,
            this.mass,
            this.tex1
        );
        this.cube = cube;
        const cubeMesh = cube.getMesh();
        this.scene.add(cubeMesh);
    }

    // ================================================================
    // RENDER AND ANIMATION METHODS
    // ================================================================

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.paused) {
            this.rigidBodySim.step();
        }
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ================================================================
    // USER INTERACTION METHODS
    // ================================================================

    resetCamera() {
        if (this.cameraControls) {
            this.cameraControls.reset();
        }
    }

    togglePause() {
        this.paused = !this.paused;
        return this.paused;
    }

    toggleLogging() {
        this.logging = !this.logging;
        return this.logging;
    }

    updateFrictionValues(staticFriction, kineticFriction) {
        this.staticFriction = staticFriction;
        this.kineticFriction = kineticFriction;
    }

    updatePlaneTextureRotation(angle) {
        this.planetexangle = angle;
    }

    updateSurfaceProperties(surface1Props, surface2Props) {
        // Update the global surface property objects
        Object.assign(Surface1Properties, surface1Props);
        Object.assign(Surface2Properties, surface2Props);

        console.log('Surface properties updated:', {
            surface1: Surface1Properties,
            surface2: Surface2Properties,
        });
    }

    applySurfaceProperties(surface1Props, surface2Props) {
        // Update properties first
        this.updateSurfaceProperties(surface1Props, surface2Props);

        if (this.surface2) {
            this.surface2.updateProperties(surface2Props);
            this.tex2 = this.surface2.texture;

            // Apply updated texture to plane if it exists
            if (this.plane && this.plane.getMesh()) {
                const planeMesh = this.plane.getMesh();
                if (planeMesh.material && this.tex2) {
                    planeMesh.material.map = this.tex2;
                    planeMesh.material.needsUpdate = true;
                }
            }
        }

        console.log('Surface properties applied to simulation');
    }

    // ================================================================
    // UTILITY METHODS
    // ================================================================

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

// ================================================================
// GLOBAL STATE MANAGEMENT
// ================================================================

let sceneRenderer;
let surfaceVisualizer = new SurfaceVisualizer(false); // false = histogram only mode
let isVisible = false;

// ================================================================
// HISTOGRAM TEXTURE SYSTEM
// ================================================================

function resetScene(angle) {
    sceneRenderer.startingAngle = angle;
    if (sceneRenderer) {
        if (sceneRenderer.cube && sceneRenderer.cube.getMesh()) {
            sceneRenderer.scene.remove(sceneRenderer.cube.getMesh());
        }
        if (sceneRenderer.plane && sceneRenderer.plane.getMesh()) {
            sceneRenderer.scene.remove(sceneRenderer.plane.getMesh());
        }
        sceneRenderer.addPlane();

        sceneRenderer.addCube(
            sceneRenderer.staticFriction,
            sceneRenderer.kineticFriction,
            sceneRenderer.mass
        );
        // Re-apply previously created histogram textures (if any) to the newly created meshes

        if (
            sceneRenderer.cubetex &&
            sceneRenderer.cube &&
            typeof sceneRenderer.cube.getMesh === 'function'
        ) {
            const cubeMesh = sceneRenderer.cube.getMesh();
            applyTextureToMeshWithProvidedTexture(
                cubeMesh,
                sceneRenderer.cubetex
            );
        }
        if (
            sceneRenderer.planetex &&
            sceneRenderer.plane &&
            typeof sceneRenderer.plane.getMesh === 'function'
        ) {
            const planeMesh = sceneRenderer.plane.getMesh();
            applyTextureToMeshWithProvidedTexture(
                planeMesh,
                sceneRenderer.planetex
            );
        }
        // Force a render to make sure textures are visible immediately
        if (
            sceneRenderer &&
            sceneRenderer.renderer &&
            sceneRenderer.scene &&
            sceneRenderer.camera
        ) {
            sceneRenderer.renderer.render(
                sceneRenderer.scene,
                sceneRenderer.camera
            );
        }
    }
    sceneRenderer.rigidBodySim = new RigidBodySimScene(
        sceneRenderer.cube,
        sceneRenderer.plane
    );
}

// ================================================================
// APPLICATION INITIALIZATION
// ================================================================

window.addEventListener('load', () => {
    sceneRenderer = new SceneRenderer();
});

// ================================================================
// UI EVENT HANDLERS
// ================================================================
// Main Control Panel Events

const resetCameraBtn = document.getElementById('resetCameraBtn');
if (resetCameraBtn) {
    resetCameraBtn.addEventListener('click', () => {
        if (sceneRenderer) {
            sceneRenderer.resetCamera();
        }
    });
}

const pauseBtn = document.getElementById('pauseBtn');
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (sceneRenderer) {
            const isPaused = sceneRenderer.togglePause();
            pauseBtn.textContent = isPaused ? 'Pause (On)' : 'Pause (Off)';
            pauseBtn.style.backgroundColor = isPaused ? '#4caf50' : '#888';
        }
    });
}

const toggleLoggingBtn = document.getElementById('toggleLoggingBtn');
if (toggleLoggingBtn) {
    toggleLoggingBtn.addEventListener('click', () => {
        if (sceneRenderer && sceneRenderer.rigidBodySim) {
            const isLogging = sceneRenderer.toggleLogging();
            toggleLoggingBtn.textContent = isLogging
                ? 'Logging (On)'
                : 'Logging (Off)';
            toggleLoggingBtn.style.backgroundColor = isLogging
                ? '#4caf50'
                : '#888';
        }
    });
}

// Physics Control Panel Events

const resetSceneBtn = document.getElementById('resetSceneBtn');
const angleSelect = document.getElementById('angleSelect');

if (resetSceneBtn && angleSelect) {
    resetSceneBtn.addEventListener('click', () => {
        const selectedAngle = parseFloat(angleSelect.value);
        resetScene(selectedAngle);
    });
}
