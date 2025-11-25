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
        this.camera.position.set(0.01, 39.99, -0.7);
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
            this.cameraControls.pitch = 89;
            this.cameraControls.yaw = 270.5;
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
            2,
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
        this.createDirectionalProfileGraph();

        // Setup keyboard controls
        this.setupKeyboardControls();

        // Start render loop
        this.animate();
    }

    createDirectionalProfileGraph() {
        // Create graph container
        const graphContainer = document.createElement('div');
        graphContainer.id = 'directional-profile-graph';
        graphContainer.style.cssText = `
            position: absolute;
            top: 80px;
            right: 20px;
            width: 320px;
            height: 340px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            z-index: 200;
            font-family: Arial, sans-serif;
            color: white;
        `;

        // Add title
        const title = document.createElement('h3');
        title.textContent = 'Directional Friction Profile (Polar)';
        title.style.cssText = `
            margin: 0 0 10px 0;
            font-size: 14px;
            text-align: center;
            color: #fff;
        `;
        graphContainer.appendChild(title);

        // Create canvas for the graph
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        canvas.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        `;
        graphContainer.appendChild(canvas);

        // Add to document body
        document.body.appendChild(graphContainer);

        // Store references for updating
        this.graphContainer = graphContainer;
        this.graphCanvas = canvas;
        this.graphContext = canvas.getContext('2d');

        // Initial render
        this.updateDirectionalProfileGraph();
    }

    updateDirectionalProfileGraph() {
        if (!this.graphContext || !this.friction) return;

        const ctx = this.graphContext;
        const canvas = this.graphCanvas;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 2 - 30;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Get directional profile data
        const profile = this.friction.directionalProfile();
        if (!profile || !profile.angles || !profile.mus) return;

        const angles = profile.angles;
        const mus = profile.mus;

        // Find min/max for scaling
        const minMu = Math.min(...mus);
        const maxMu = Math.max(...mus);
        const muRange = maxMu - minMu || 1; // Avoid division by zero

        // Draw circular grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;

        // Draw concentric circles
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, (i / 4) * maxRadius, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Draw radial lines (every 30 degrees)
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 * Math.PI) / 180;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle - Math.PI / 2) * maxRadius,
                centerY + Math.sin(angle - Math.PI / 2) * maxRadius
            );
            ctx.stroke();
        }

        // Draw the friction profile as polar plot
        ctx.strokeStyle = '#00ff88';
        ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
        ctx.lineWidth = 3;

        // Fill area
        ctx.beginPath();
        for (let i = 0; i < angles.length; i++) {
            const normalizedMu = (mus[i] - minMu) / muRange;
            const radius = (normalizedMu * 0.8 + 0.2) * maxRadius; // 20-100% of max radius
            const x = centerX + Math.cos(angles[i] - Math.PI / 2) * radius;
            const y = centerY + Math.sin(angles[i] - Math.PI / 2) * radius;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();

        // Draw outline
        ctx.beginPath();
        for (let i = 0; i < angles.length; i++) {
            const normalizedMu = (mus[i] - minMu) / muRange;
            const radius = (normalizedMu * 0.8 + 0.2) * maxRadius;
            const x = centerX + Math.cos(angles[i] - Math.PI / 2) * radius;
            const y = centerY + Math.sin(angles[i] - Math.PI / 2) * radius;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();

        // Draw angle labels
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';

        const labelRadius = maxRadius + 15;
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45 * Math.PI) / 180;
            const x = centerX + Math.cos(angle - Math.PI / 2) * labelRadius;
            const y = centerY + Math.sin(angle - Math.PI / 2) * labelRadius;
            ctx.fillText(`${i * 45}°`, x, y + 4);
        }

        // Draw value labels
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Min: ${minMu.toFixed(3)}`, 5, height - 15);
        ctx.fillText(`Max: ${maxMu.toFixed(3)}`, 5, height - 5);

        // Draw center dot
        ctx.fillStyle = '#ff0040';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        ctx.fill();
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
        this.updateDirectionalProfileGraph();
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
            if (event.key.toLowerCase() === 'x') {
                // Add speed in x direction to the cube
                const speedBoost = 10.0;
                this.cube.velocity.x = speedBoost;
            }
            if (event.key.toLowerCase() === 'z') {
                // Add speed in z direction to the cube
                const speedBoost = 10.0;
                this.cube.velocity.z = -speedBoost;
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
