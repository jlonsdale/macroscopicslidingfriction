class SceneRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cube = null;
        this.cameraControls = null;
        this.startingAngle = 15;

        this.staticFriction = 0.6;
        this.kineticFriction = 0.5;
        this.mass = 5;

        this.logging = false;
        this.paused = false;

        this.init();
        this.addPlane();
        this.addCube(this.staticFriction, this.kineticFriction);
        this.setupCameraControls();

        this.rigidBodySim = new RigidBodySimScene(this.cube, this.plane);

        this.animate();
    }

    init() {
        try {
            //setup threejs scene
            this.scene = new THREE.Scene();
            this.camera = threeCamera;
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x222222, 1);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            const container = document.getElementById('container');
            container.appendChild(this.renderer.domElement);
            this.addLights();

            window.addEventListener(
                'resize',
                () => this.onWindowResize(),
                false
            );
        } catch (error) {
            this.showError('Failed to initialize Three.js: ' + error.message);
        }
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
    }

    setupCameraControls() {
        this.cameraControls = new CameraControls(this.camera, this.renderer);
    }

    addPlane() {
        const plane = new Plane(this.startingAngle);
        this.plane = plane;

        const planeMesh = plane.getMesh();
        this.scene.add(planeMesh);
    }

    addCube(staticFriction, kineticFriction) {
        let startingPosition = new THREE.Vector3(-5, 10, 0);
        let size = 4;
        const cube = new Cube(
            startingPosition,
            size,
            staticFriction,
            kineticFriction,
            this.mass
        );
        this.cube = cube;
        const cubeMesh = cube.getMesh();
        this.scene.add(cubeMesh);
    }

    resetCamera() {
        if (this.cameraControls) {
            this.cameraControls.reset();
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.paused == false) {
            this.rigidBodySim.step();
        }
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

let sceneRenderer;

window.addEventListener('load', () => {
    sceneRenderer = new SceneRenderer();
});

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
            sceneRenderer.paused = !sceneRenderer.paused;
            pauseBtn.textContent = sceneRenderer.paused
                ? 'Pause (On)'
                : 'Pause (Off)';
            pauseBtn.style.backgroundColor = sceneRenderer.paused
                ? '#4caf50'
                : '#888';
        }
    });
}

const resetSceneBtn = document.getElementById('resetSceneBtn');
const angleSelect = document.getElementById('angleSelect');

if (resetSceneBtn && angleSelect) {
    resetSceneBtn.addEventListener('click', () => {
        const selectedAngle = parseFloat(angleSelect.value);
        resetScene(selectedAngle);
    });
}

const toggleLoggingBtn = document.getElementById('toggleLoggingBtn');
if (toggleLoggingBtn) {
    toggleLoggingBtn.addEventListener('click', () => {
        if (sceneRenderer && sceneRenderer.rigidBodySim) {
            sceneRenderer.logging = !sceneRenderer.logging;
            toggleLoggingBtn.textContent = sceneRenderer.logging
                ? 'Logging (On)'
                : 'Logging (Off)';
            toggleLoggingBtn.style.backgroundColor = sceneRenderer.logging
                ? '#4caf50'
                : '#888';
        }
    });
}

const openSurfaceVisualizerBtn = document.getElementById(
    'openSurfaceVisualizerBtn'
);
if (openSurfaceVisualizerBtn) {
    openSurfaceVisualizerBtn.addEventListener('click', () => {
        const panel =
            document.getElementById('surfaceVisualizerContainer') ||
            openSurfaceVisualizerBtn.closest('.panel') ||
            document.getElementById('container');

        if (panel) {
            panel.classList.toggle('expanded');

            if (panel.classList.contains('expanded')) {
                // expand smoothly using max-height
                panel.style.maxHeight = panel.scrollHeight + 'px';
                openSurfaceVisualizerBtn.textContent =
                    'Close Surface Visualizer';
                openSurfaceVisualizerBtn.style.backgroundColor = '#4caf50';
            } else {
                // collapse
                panel.style.maxHeight = '0';
                openSurfaceVisualizerBtn.textContent =
                    'Open Surface Visualizer';
                openSurfaceVisualizerBtn.style.backgroundColor = '#888';
            }
        }
        const surfaceVisualizer = new SurfaceVisualizer(false); // true = full render mode
    });
}

const staticFrictionSlider = document.getElementById('staticFrictionSlider');
const kineticFrictionSlider = document.getElementById('kineticFrictionSlider');
const staticFrictionValue = document.getElementById('staticFrictionValue');
const kineticFrictionValue = document.getElementById('kineticFrictionValue');
const massValue = document.getElementById('massValue');
const massSlider = document.getElementById('massSlider');

if (massSlider && massValue) {
    massSlider.addEventListener('input', () => {
        const value = parseFloat(massSlider.value);
        massValue.textContent = value.toFixed(2);
        if (sceneRenderer) {
            sceneRenderer.mass = value;
        }
    });
    // Initialize display
    massValue.textContent = parseFloat(massSlider.value).toFixed(2);
}

if (staticFrictionSlider && staticFrictionValue) {
    staticFrictionSlider.addEventListener('input', () => {
        const value = parseFloat(staticFrictionSlider.value);
        staticFrictionValue.textContent = value.toFixed(2);
        if (sceneRenderer) {
            sceneRenderer.staticFriction = value;
        }
    });
    // Initialize display
    staticFrictionValue.textContent = parseFloat(
        staticFrictionSlider.value
    ).toFixed(2);
}

if (kineticFrictionSlider && kineticFrictionValue) {
    kineticFrictionSlider.addEventListener('input', () => {
        const value = parseFloat(kineticFrictionSlider.value);
        kineticFrictionValue.textContent = value.toFixed(2);
        if (sceneRenderer) {
            sceneRenderer.kineticFriction = value;
        }
    });
    // Initialize display
    kineticFrictionValue.textContent = parseFloat(
        kineticFrictionSlider.value
    ).toFixed(2);
}

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
        sceneRenderer.rigidBodySim = new RigidBodySimScene(
            sceneRenderer.cube,
            sceneRenderer.plane
        );
    }
}

// Check if required elements exist
const toggleSurfaceBtn = document.getElementById('toggleSurfaceBtn');
const surfaceControls = document.getElementById('surfaceControls');
const surfacePanel = document.querySelector('.control-panel-surface');

// Initialize the surface visualizer in histogram-only mode
let surfaceVisualizer = new SurfaceVisualizer(false); // false = histogram only mode
// State tracking
let isVisible = false;

// Toggle surface controls and histogram
toggleSurfaceBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    isVisible = !isVisible;

    if (isVisible) {
        // Show controls and expand panel
        surfaceControls.style.display = 'block';
        if (surfacePanel) {
            surfacePanel.classList.add('expanded');
        }
        toggleSurfaceBtn.textContent = 'Hide';

        // Generate the histogram in the miniView area
        try {
            surfaceVisualizer.createNDFHistogram();
        } catch (error) {
            // Silently handle error
        }
    } else {
        // Hide controls and collapse panel
        surfaceControls.style.display = 'none';
        if (surfacePanel) {
            surfacePanel.classList.remove('expanded');
        }
        toggleSurfaceBtn.textContent = 'Show';

        // Clear the histogram
        const histogramPlot = document.getElementById('ndf-histogram');
        if (histogramPlot) {
            histogramPlot.innerHTML = '';
        }
    }
});
