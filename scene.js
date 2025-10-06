let paused = false;

class SceneRenderer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cube = null;
        this.cameraControls = null;

        this.axis = new THREE.AxesHelper(50);
        this.init();
        this.addPlane()
        this.addCube();
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
            this.axisOverlay
            window.addEventListener('resize', () => this.onWindowResize(), false);
            
            this.axis.position.set(-window.innerWidth / 200 + 5, -window.innerHeight / 200 + 5, 0);
            this.scene.add(this.axis);
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
        const plane = new Plane()
        plane.rotateby45();
        const planeMesh = plane.getMesh()
        this.scene.add(planeMesh);
        this.plane = plane;
    }
    
    addCube(position = new THREE.Vector3(1, 1, 0), size = 2) {
        const cube = new Cube(position, size);
        const cubeMesh = cube.getMesh();
        console.log(cubeMesh);
        this.scene.add(cubeMesh);
        this.cube = cube;
    }
    
  
    resetCamera() {
        if (this.cameraControls) {
            this.cameraControls.reset();
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        if (paused==false) {
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
        paused = !paused;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    });
}

window.sceneRenderer = sceneRenderer;



window.addEventListener('load', () => {
    if (sceneRenderer && sceneRenderer.renderer) {
        addAxisOverlay(sceneRenderer.renderer);
    }
});