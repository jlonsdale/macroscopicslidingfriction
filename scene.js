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
            kineticFriction
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
        if (this.logging && this.rigidBodySim.atrest == false) {
            let position = this.cube.getPosition();
            let vel = this.cube.getVelocity();
            let angvel = this.cube.getAngularVelocity();
            console.log(
                `Position: (${position.x.toFixed(2)}, ${position.y.toFixed(
                    2
                )}, ${position.z.toFixed(2)})`
            );
            console.log(
                `Velocity: (${vel.x.toFixed(2)}, ${vel.y.toFixed(
                    2
                )}, ${vel.z.toFixed(2)})`
            );
            console.log(
                `Angular Velocity: (${angvel.x.toFixed(2)}, ${angvel.y.toFixed(
                    2
                )}, ${angvel.z.toFixed(2)})`
            );
        }
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
        console.error(message);
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

const staticFrictionSlider = document.getElementById('staticFrictionSlider');
const kineticFrictionSlider = document.getElementById('kineticFrictionSlider');
const staticFrictionValue = document.getElementById('staticFrictionValue');
const kineticFrictionValue = document.getElementById('kineticFrictionValue');

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
            sceneRenderer.kineticFriction
        );
        sceneRenderer.rigidBodySim = new RigidBodySimScene(
            sceneRenderer.cube,
            sceneRenderer.plane
        );
    }
}

window.sceneRenderer = sceneRenderer;
