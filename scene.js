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
        this.plane = null;
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
        directionalLight.position.set(10, 10, 5);
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

// Extract only the data visualization from a histogram, removing axes and labels
function extractDataOnlyFromHistogram(sourceCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d');
    const srcCtx = sourceCanvas.getContext('2d');

    // Get image data from source
    const imageData = srcCtx.getImageData(
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height
    );
    const data = imageData.data;

    // Create new image data for processed version
    const newImageData = ctx.createImageData(
        sourceCanvas.width,
        sourceCanvas.height
    );
    const newData = newImageData.data;

    // Define colors to ignore (typical chart background/axis colors)
    const ignoredColors = [
        { r: 255, g: 255, b: 255, threshold: 10 }, // White background
        { r: 0, g: 0, b: 0, threshold: 50 }, // Black text/axes
        { r: 128, g: 128, b: 128, threshold: 30 }, // Gray grid lines
        { r: 68, g: 68, b: 68, threshold: 20 }, // Dark gray (#444)
        { r: 34, g: 34, b: 34, threshold: 20 }, // Very dark gray (#222)
    ];

    // Function to check if a color should be ignored
    const shouldIgnoreColor = (r, g, b) => {
        return ignoredColors.some(ignored => {
            const distance = Math.sqrt(
                Math.pow(r - ignored.r, 2) +
                    Math.pow(g - ignored.g, 2) +
                    Math.pow(b - ignored.b, 2)
            );
            return distance < ignored.threshold;
        });
    };

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0 || shouldIgnoreColor(r, g, b)) {
            // Make background/axis pixels transparent
            newData[i] = 0; // R
            newData[i + 1] = 0; // G
            newData[i + 2] = 0; // B
            newData[i + 3] = 0; // A (transparent)
        } else {
            // Keep data colors
            newData[i] = r;
            newData[i + 1] = g;
            newData[i + 2] = b;
            newData[i + 3] = a;
        }
    }

    // Find the bounding box of actual data (non-background) pixels
    let minX = sourceCanvas.width,
        maxX = 0;
    let minY = sourceCanvas.height,
        maxY = 0;

    // Scan for data pixels to find bounds
    for (let y = 0; y < sourceCanvas.height; y++) {
        for (let x = 0; x < sourceCanvas.width; x++) {
            const pixelIndex = (y * sourceCanvas.width + x) * 4;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            const a = data[pixelIndex + 3];

            // If this is a data pixel (not background/axis)
            if (a > 0 && !shouldIgnoreColor(r, g, b)) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
    }

    // If no data found, return empty canvas
    if (minX >= maxX || minY >= maxY) {
        console.log('No data pixels found in histogram');
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas;
    }

    console.log(`Found data bounds: x(${minX}-${maxX}), y(${minY}-${maxY})`);

    // Calculate scaling factors to stretch data to fill entire canvas
    const dataWidth = maxX - minX + 1;
    const dataHeight = maxY - minY + 1;
    const scaleX = sourceCanvas.width / dataWidth;
    const scaleY = sourceCanvas.height / dataHeight;

    // Create stretched version that fills entire canvas
    const stretchedData = new Uint8ClampedArray(newData.length);

    // Fill the entire canvas by stretching the data region
    for (let y = 0; y < sourceCanvas.height; y++) {
        for (let x = 0; x < sourceCanvas.width; x++) {
            // Map current position back to original data region
            const srcX = Math.floor(minX + x / scaleX);
            const srcY = Math.floor(minY + y / scaleY);

            // Clamp to bounds
            const clampedX = Math.max(minX, Math.min(maxX, srcX));
            const clampedY = Math.max(minY, Math.min(maxY, srcY));

            const srcPixelIndex =
                (clampedY * sourceCanvas.width + clampedX) * 4;
            const destPixelIndex = (y * sourceCanvas.width + x) * 4;

            const r = data[srcPixelIndex];
            const g = data[srcPixelIndex + 1];
            const b = data[srcPixelIndex + 2];
            const a = data[srcPixelIndex + 3];

            // If it's a data pixel, use it; otherwise use a dark background
            if (a > 0 && !shouldIgnoreColor(r, g, b)) {
                stretchedData[destPixelIndex] = r;
                stretchedData[destPixelIndex + 1] = g;
                stretchedData[destPixelIndex + 2] = b;
                stretchedData[destPixelIndex + 3] = a;
            } else {
                // Fill non-data areas with dark color
                stretchedData[destPixelIndex] = 20;
                stretchedData[destPixelIndex + 1] = 20;
                stretchedData[destPixelIndex + 2] = 20;
                stretchedData[destPixelIndex + 3] = 255;
            }
        }
    }

    // Create new image data with stretched content
    const stretchedImageData = new ImageData(
        stretchedData,
        sourceCanvas.width,
        sourceCanvas.height
    );
    ctx.putImageData(stretchedImageData, 0, 0);

    console.log(
        `Stretched histogram data to fill entire ${sourceCanvas.width}x${sourceCanvas.height} canvas`
    );
    return canvas;
}

// Utility: capture histogram from surface visualizer or create from data
async function getHistogramCanvas(width = 512, height = 512) {
    const container = document.getElementById('ndf-histogram');

    // First, try to capture the existing histogram from the surface visualizer
    if (container) {
        console.log('Looking for existing histogram in surface visualizer...');

        // Check for canvas element first
        const existingCanvas = container.querySelector('canvas');
        if (
            existingCanvas &&
            existingCanvas.width > 0 &&
            existingCanvas.height > 0
        ) {
            console.log(
                'Found existing canvas histogram, using it for texture'
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Draw the existing histogram canvas to our texture canvas
            ctx.drawImage(existingCanvas, 0, 0, width, height);

            // Process to remove axes and extract only data
            return extractDataOnlyFromHistogram(canvas);
        }

        // Check for SVG element
        const svg = container.querySelector('svg');
        if (svg) {
            console.log('Found existing SVG histogram, converting to canvas');
            try {
                const svgData = new XMLSerializer().serializeToString(svg);
                const img = new Image();
                const svgBlob = new Blob([svgData], {
                    type: 'image/svg+xml;charset=utf-8',
                });
                const url = URL.createObjectURL(svgBlob);

                return new Promise(resolve => {
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        URL.revokeObjectURL(url);

                        // Process to remove axes and extract only data
                        resolve(extractDataOnlyFromHistogram(canvas));
                    };
                    img.onerror = () => {
                        console.log(
                            'Failed to convert SVG, falling back to data generation'
                        );
                        URL.revokeObjectURL(url);
                        resolve(buildCanvasFromNDFData(width, height));
                    };
                    img.src = url;
                });
            } catch (error) {
                console.log('Error processing SVG histogram:', error);
            }
        }

        // Check for any other visualization elements (like Plotly divs)
        const plotlyDiv = container.querySelector('.plotly-graph-div');
        if (plotlyDiv) {
            console.log('Found Plotly histogram, attempting to capture');
            try {
                // Try to export the Plotly chart as an image
                const plotlyCanvas = await Plotly.toImage(plotlyDiv, {
                    format: 'canvas',
                    width: width,
                    height: height,
                });

                if (plotlyCanvas) {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    const img = new Image();

                    return new Promise(resolve => {
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0, width, height);
                            // Process to remove axes and extract only data
                            resolve(extractDataOnlyFromHistogram(canvas));
                        };
                        img.onerror = () => {
                            console.log(
                                'Failed to load Plotly image, falling back to data generation'
                            );
                            resolve(buildCanvasFromNDFData(width, height));
                        };
                        img.src = plotlyCanvas;
                    });
                }
            } catch (error) {
                console.log('Error capturing Plotly histogram:', error);
            }
        }
    }

    // Fallback: create from raw data
    console.log('No existing histogram found, generating from NDF data');
    return buildCanvasFromNDFData(width, height);
}

// Draw a simple histogram from NDF data returned by surfaceVisualizer.getNDFData()
function buildCanvasFromNDFData(width = 512, height = 512) {
    console.log(
        'Building canvas from NDF data, dimensions:',
        width,
        'x',
        height
    );

    let ndfResult = null;
    try {
        if (
            surfaceVisualizer &&
            typeof surfaceVisualizer.getNDFData === 'function'
        ) {
            ndfResult = surfaceVisualizer.getNDFData();
        }
    } catch (error) {
        console.warn('Error getting NDF data:', error);
    }

    console.log('NDF result:', ndfResult);

    // Extract the area weights array from the NDF result
    let data = null;
    if (ndfResult && typeof ndfResult === 'object') {
        if (
            Array.isArray(ndfResult.areaWeights) &&
            ndfResult.areaWeights.length > 0
        ) {
            data = ndfResult.areaWeights;
        } else if (
            Array.isArray(ndfResult.ndfSamples) &&
            ndfResult.ndfSamples.length > 0
        ) {
            data = ndfResult.ndfSamples;
        }
    } else if (Array.isArray(ndfResult)) {
        data = ndfResult;
    }

    console.log('Extracted data array:', data);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Start with a completely clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('No valid NDF data available - cannot create texture');
        // Create a simple solid color canvas to indicate no data
        ctx.fillStyle = '#444444';
        ctx.fillRect(0, 0, width, height);
        return canvas;
    }

    console.log('Processing NDF data array with length:', data.length);

    // For visualization, we need to reduce the data to a manageable size
    // Create histogram bins from the large dataset
    const numBins = Math.min(512, data.length); // Max 512 bins for texture
    const binSize = Math.ceil(data.length / numBins);
    const binnedData = [];

    for (let i = 0; i < numBins; i++) {
        let sum = 0;
        let count = 0;
        for (
            let j = i * binSize;
            j < Math.min((i + 1) * binSize, data.length);
            j++
        ) {
            sum += data[j];
            count++;
        }
        binnedData.push(count > 0 ? sum / count : 0); // Average value in this bin
    }

    console.log('Binned data to', binnedData.length, 'values');

    // Find min/max without using spread operator (which causes stack overflow)
    let maxVal = binnedData[0];
    let minVal = binnedData[0];
    for (let i = 1; i < binnedData.length; i++) {
        if (binnedData[i] > maxVal) maxVal = binnedData[i];
        if (binnedData[i] < minVal) minVal = binnedData[i];
    }
    console.log('Binned data range:', minVal, 'to', maxVal);

    const norm = v =>
        maxVal === minVal ? 0 : (v - minVal) / (maxVal - minVal);

    // Create a smooth horizontal gradient that fills the entire face
    // Use binned data stretched across the full width
    data = binnedData;

    // Create a horizontal gradient using the canvas gradient API for smoothness
    const gradient = ctx.createLinearGradient(0, 0, width, 0);

    // Add color stops based on data values
    for (let i = 0; i < data.length; i++) {
        const position = i / (data.length - 1); // 0 to 1
        const normalizedValue = norm(data[i]);

        // Color based on data value
        const hue = 240 - 120 * normalizedValue; // Blue to red gradient
        const saturation = Math.round(70 + 20 * normalizedValue);
        const lightness = Math.round(40 + 40 * normalizedValue);

        const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        gradient.addColorStop(position, color);
    }

    // Fill the entire canvas with the gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return canvas;
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Create a THREE.Texture from the histogram image/canvas
async function createHistogramTexture(options = {}) {
    // Use square dimensions for cube faces to ensure proper mapping
    const w = options.width || 512;
    const h = options.height || 512; // Make height same as width for cube faces
    const canvas = await getHistogramCanvas(w, h);

    // Use CanvasTexture for best compatibility and dynamic updates
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Use RepeatWrapping to ensure texture fits exactly on each cube face
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Set repeat to 1,1 to show texture exactly once per face
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);

    // Use nearest filtering for crisp histogram appearance
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    // Prevent texture flipping
    texture.flipY = false;

    return texture;
}

// Convenience: apply histogram texture to a mesh's material (e.g. the cube)
// If mesh.material is an array handle first element; preserves existing material properties
const applyHistogramTextureBtn = document.getElementById(
    'applyHistogramTextureBtn'
);
if (applyHistogramTextureBtn) {
    applyHistogramTextureBtn.addEventListener('click', async () => {
        applyHistogramTextureBtn.disabled = true;
        const prevText = applyHistogramTextureBtn.textContent;
        applyHistogramTextureBtn.textContent = 'Applying...';

        try {
            if (!sceneRenderer) throw new Error('Scene not initialized');

            const mesh =
                sceneRenderer.cube &&
                typeof sceneRenderer.cube.getMesh === 'function'
                    ? sceneRenderer.cube.getMesh()
                    : null;
            if (!mesh) throw new Error('No target mesh found');

            const texture = await applyHistogramTextureToMesh(mesh);
            if (!texture) throw new Error('Failed to create/apply texture');

            // force a render update if renderer available
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
            applyHistogramTextureBtn.textContent = 'Applied';
        } catch (err) {
            console.error('applyHistogramTextureBtn error:', err);
            applyHistogramTextureBtn.textContent = 'Error';
        } finally {
            setTimeout(() => {
                applyHistogramTextureBtn.disabled = false;
                applyHistogramTextureBtn.textContent = prevText;
            }, 1000);
        }
    });
}
async function applyHistogramTextureToMesh(mesh) {
    console.log('Applying histogram texture to mesh:', mesh);
    if (!mesh) return null;
    try {
        const texture = await createHistogramTexture({
            width: 512,
            height: 512,
        });
        console.log('Created texture:', texture);
        console.log('Texture image data:', texture.image);

        const material = Array.isArray(mesh.material)
            ? mesh.material[0]
            : mesh.material;
        if (!material) return texture;

        // Ensure the geometry has proper UV coordinates for cube mapping
        if (mesh.geometry && mesh.geometry instanceof THREE.BoxGeometry) {
            // BoxGeometry already has proper UV coordinates, but we can verify/optimize
            const uvAttribute = mesh.geometry.attributes.uv;
            if (uvAttribute) {
                // UV coordinates are already set up correctly for box geometry
                console.log('UV coordinates are properly set for cube faces');
            }
        }

        // Apply texture to material
        if ('map' in material) {
            material.map = texture;
        } else if (material.uniforms && material.uniforms.map) {
            material.uniforms.map.value = texture;
        } else if (material.uniforms && material.uniforms.uMap) {
            material.uniforms.uMap.value = texture;
        } else {
            // Last resort: attach map property
            material.map = texture;
        }

        // Reset material color to white so texture shows properly
        // (Lambert material multiplies texture by base color)
        material.color.setHex(0xffffff);

        // Ensure proper texture mapping settings
        material.transparent = true;
        material.opacity = 0.9;

        texture.needsUpdate = true;
        material.needsUpdate = true;

        console.log(
            'Histogram texture applied successfully with exact cube mapping'
        );
        return texture;
    } catch (error) {
        console.error('applyHistogramTextureToMesh error:', error);
        return null;
    }
}

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
        sceneRenderer.rigidBodySim = new RigidBodySimScene(
            sceneRenderer.cube,
            sceneRenderer.plane
        );
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
