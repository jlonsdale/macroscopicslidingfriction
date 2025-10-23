// ================================================================
// MACROSCOPIC SLIDING FRICTION - SCENE MANAGEMENT
// ================================================================
// File Structure:
// 1. SceneRenderer Class - Main 3D scene and physics management
// 2. Global State Management - Application state variables
// 3. Histogram Texture System - NDF visualization and texture mapping
// 4. Scene Utility Functions - Helper functions for scene operations
// 5. Application Initialization - Setup and startup code
// 6. UI Event Handlers - User interface interaction management
// ================================================================

// ================================================================
// SCENE RENDERER CLASS - Main 3D Scene Management
// ================================================================

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
        this.planetex = null;
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
    }

    // ================================================================
    // SCENE OBJECT MANAGEMENT
    // ================================================================

    addPlane() {
        const plane = new Plane(this.startingAngle);
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
            this.mass
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

// Create a THREE.Texture from the histogram image/canvas
async function createHistogramTexture(options = {}) {
    const { width = 512, height = 512 } = options;
    try {
        const container = document.getElementById('ndf-histogram');
        if (!container)
            throw new Error('Histogram element (#ndf-histogram) not found');

        // Helper to create a THREE texture from a canvas
        const canvasToTexture = canvas => {
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            tex.needsUpdate = true;
            return tex;
        };

        // If the element itself is a canvas or contains a canvas, draw it to a fresh canvas
        let sourceCanvas = null;
        if (container instanceof HTMLCanvasElement) {
            sourceCanvas = container;
        } else {
            const childCanvas = container.querySelector('canvas');
            if (childCanvas instanceof HTMLCanvasElement)
                sourceCanvas = childCanvas;
        }
        if (sourceCanvas) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(sourceCanvas, 0, 0, width, height);
            return canvasToTexture(canvas);
        }

        // If it contains an <img>, use that
        const imgEl = container.querySelector('img');
        if (imgEl) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            await new Promise((resolve, reject) => {
                if (imgEl.complete) {
                    ctx.drawImage(imgEl, 0, 0, width, height);
                    return resolve();
                }
                imgEl.onload = () => {
                    ctx.drawImage(imgEl, 0, 0, width, height);
                    resolve();
                };
                imgEl.onerror = reject;
            });
            return canvasToTexture(canvas);
        }

        // If it contains an <svg>, serialize and draw to canvas
        const svgEl = container.querySelector('svg');
        if (svgEl) {
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(svgEl);
            if (!/xmlns=/.test(svgString)) {
                svgString = svgString.replace(
                    /^<svg/,
                    '<svg xmlns="http://www.w3.org/2000/svg"'
                );
            }
            // force width/height on the serialized svg
            svgString = svgString.replace(
                /<svg([^>]*)>/,
                `<svg$1 width="${width}" height="${height}">`
            );
            const blob = new Blob([svgString], {
                type: 'image/svg+xml;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = e => {
                    URL.revokeObjectURL(url);
                    reject(e);
                };
                img.src = url;
            });
            return canvasToTexture(canvas);
        }

        // Fallback: serialize the element (foreignObject) into an SVG and rasterize
        {
            const serializer = new XMLSerializer();
            const htmlString = serializer.serializeToString(container);
            const svgWrapper = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                      <foreignObject width="100%" height="100%">${htmlString}</foreignObject>
                    </svg>`;
            const blob = new Blob([svgWrapper], {
                type: 'image/svg+xml;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = e => {
                    URL.revokeObjectURL(url);
                    reject(e);
                };
                img.src = url;
            });
            return canvasToTexture(canvas);
        }
    } catch (error) {
        console.error('createHistogramTexture failed:', error);
        return null;
    }
}

// Convenience: apply histogram texture to a mesh's material (e.g. the cube)
// If mesh.material is an array handle first element; preserves existing material properties
const applyHistogramTextureBtn = document.getElementById(
    'applyHistogramTextureBtn'
);
const applyButtons = Array.from(
    document.querySelectorAll('.applyHistogramTextureBtn')
);

function getTargetMeshes(target) {
    if (!sceneRenderer) return [];
    const meshes = [];
    const cubeMesh =
        sceneRenderer.cube && typeof sceneRenderer.cube.getMesh === 'function'
            ? sceneRenderer.cube.getMesh()
            : null;
    const planeMesh =
        sceneRenderer.plane && typeof sceneRenderer.plane.getMesh === 'function'
            ? sceneRenderer.plane.getMesh()
            : null;

    switch ((target || 'cube').toLowerCase()) {
        case 'cube':
            if (cubeMesh) meshes.push(cubeMesh);
            break;
        case 'plane':
            if (planeMesh) meshes.push(planeMesh);
            break;
    }
    return meshes;
}

async function applyTextureToMeshWithProvidedTexture(mesh, texture) {
    if (!mesh || !texture) return false;
    try {
        const material = Array.isArray(mesh.material)
            ? mesh.material[0]
            : mesh.material;
        if (!material) return false;

        // Apply texture to typical material slots or shader uniforms
        if ('map' in material) {
            material.map = texture;
        } else if (material.uniforms && material.uniforms.map) {
            material.uniforms.map.value = texture;
        } else if (material.uniforms && material.uniforms.uMap) {
            material.uniforms.uMap.value = texture;
        } else {
            material.map = texture;
        }

        // Make sure texture and material updates are visible
        if (material.color && typeof material.color.setHex === 'function') {
            material.color.setHex(0xffffff);
        }
        texture.needsUpdate = true;
        material.needsUpdate = true;

        // Optional: ensure transparency settings don't hide the texture
        material.transparent = true;
        material.opacity = 0.95;

        return true;
    } catch (err) {
        console.error('applyTextureToMeshWithProvidedTexture error:', err);
        return false;
    }
}

applyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        console.log('im in this FUNCTION');
        const prevText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Applying...';

        try {
            if (!sceneRenderer) throw new Error('Scene not initialized');

            const target = btn.dataset.target || 'cube';
            const meshes = getTargetMeshes(target);
            if (!meshes.length)
                throw new Error('No target meshes found for: ' + target);

            // Create a single texture and reuse for all target meshes
            const texture = await createHistogramTexture({
                width: 512,
                height: 512,
            });
            // store the created texture on the sceneRenderer for later use
            if (sceneRenderer && texture) {
                const t = texture;
                const lowerTarget = (target || 'cube').toLowerCase();

                if (lowerTarget === 'cube') {
                    sceneRenderer.cubetex = t;
                }

                if (lowerTarget === 'plane') {
                    sceneRenderer.planetex = t;
                }
            }
            if (!texture) throw new Error('Failed to create histogram texture');

            // Apply texture to every selected mesh (reuse same texture instance)
            const results = await Promise.all(
                meshes.map(m =>
                    applyTextureToMeshWithProvidedTexture(m, texture)
                )
            );
            if (!results.some(r => r))
                throw new Error('Failed to apply texture to any target mesh');

            // Force one render pass to update the view
            if (
                sceneRenderer.renderer &&
                sceneRenderer.scene &&
                sceneRenderer.camera
            ) {
                sceneRenderer.renderer.render(
                    sceneRenderer.scene,
                    sceneRenderer.camera
                );
            }

            btn.textContent = 'Applied';
        } catch (err) {
            console.error('applyHistogramTexture button error:', err);
            btn.textContent = 'Error';
        } finally {
            // Re-enable the button after a short delay to show the status
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = prevText;
            }, 1500);

            if (sceneRenderer) {
                resetScene(sceneRenderer.startingAngle);
            }
        }
    });
});

// ================================================================
// SCENE UTILITY FUNCTIONS
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
// RESET TEXTURE FUNCTION
// ================================================================

function resetTextures() {
    try {
        if (sceneRenderer) {
            // Reset stored textures
            sceneRenderer.cubetex = null;
            sceneRenderer.planetex = null;

            // Reset cube material to original state
            if (sceneRenderer.cube && sceneRenderer.cube.mesh) {
                const cubeMaterial = sceneRenderer.cube.mesh.material;
                if (cubeMaterial) {
                    cubeMaterial.map = null;
                    cubeMaterial.color.setHex(0x00ff88); // Original cube color
                    cubeMaterial.transparent = true;
                    cubeMaterial.opacity = 0.8;
                    cubeMaterial.needsUpdate = true;
                }
            }

            // Reset plane material to original checkerboard texture
            if (sceneRenderer.plane && sceneRenderer.plane.mesh) {
                const planeMaterial = sceneRenderer.plane.mesh.material;
                if (planeMaterial) {
                    planeMaterial.map = null;
                    planeMaterial.color.setHex(0x708090); // Original plane color
                    planeMaterial.needsUpdate = true;
                }
            }

            // Re-enable and reset all apply buttons
            const applyButtons = Array.from(
                document.querySelectorAll('[data-target]')
            );
            applyButtons.forEach(btn => {
                btn.disabled = false;
                if (
                    btn.textContent === 'Applied' ||
                    btn.textContent === 'Error' ||
                    btn.textContent === 'Applying...'
                ) {
                    btn.textContent = 'Apply Histogram Texture';
                }
            });

            console.log('Textures reset successfully');
        }
    } catch (err) {
        console.error('Error resetting textures:', err);
    }
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

// Reset Texture Button
const resetTextureBtn = document.getElementById('resetTextureBtn');
if (resetTextureBtn) {
    resetTextureBtn.addEventListener('click', () => {
        resetTextures();
    });
}

// Friction Controls
const staticFrictionSlider = document.getElementById('staticFrictionSlider');
const staticFrictionValue = document.getElementById('staticFrictionValue');
const kineticFrictionSlider = document.getElementById('kineticFrictionSlider');
const kineticFrictionValue = document.getElementById('kineticFrictionValue');

if (staticFrictionSlider && staticFrictionValue) {
    staticFrictionSlider.addEventListener('input', () => {
        const value = parseFloat(staticFrictionSlider.value);
        staticFrictionValue.textContent = value.toFixed(2);
        if (sceneRenderer) {
            sceneRenderer.updateFrictionValues(
                value,
                sceneRenderer.kineticFriction
            );
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
            sceneRenderer.updateFrictionValues(
                sceneRenderer.staticFriction,
                value
            );
        }
    });
    // Initialize display
    kineticFrictionValue.textContent = parseFloat(
        kineticFrictionSlider.value
    ).toFixed(2);
}

// Surface Visualizer Control Events

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
    });
}

// Surface toggle button
const toggleSurfaceBtn = document.getElementById('toggleSurfaceBtn');
const surfaceControls = document.getElementById('surfaceControls');
const surfacePanel = document.querySelector('.control-panel-surface');

if (toggleSurfaceBtn && surfaceControls) {
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
}
