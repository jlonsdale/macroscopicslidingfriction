class SurfaceVisualizer {
    constructor(render = true) {
        this.initializeParams(render);
        this.initializeThreeJS();
        this.initializeGeometry();
        this.setupEventListeners();
        this.setupControls();

        this.repaint();
        if (this.params.render) {
            this.render();
        }
    }

    initializeThreeJS() {
        const app =
            document.getElementById('app') ||
            document.getElementById('container');
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setSize(innerWidth, innerHeight);
        this.scene = new THREE.Scene();
        if (this.params.render) {
            app.appendChild(this.renderer.domElement);
            this.scene.background = new THREE.Color(0x0b0d10);
            this.camera = new THREE.PerspectiveCamera(
                55,
                innerWidth / innerHeight,
                0.1,
                5000
            );
            this.camera.position.set(60, 30, 60);
            this.camera.lookAt(0, 0, 0);
            const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.9);
            this.scene.add(hemi);
            const dir = new THREE.DirectionalLight(0xffffff, 1.0);
            dir.position.set(20, 40, 10);
            this.scene.add(dir);
        }
    }

    // ——— Unified params
    initializeParams(render) {
        this.params = {
            L: 120,
            resolution: 256,
            wireframe: true,
            colorize: true,
            render: render,
            surfaceType: 'Sine', // 'Sine' | 'Noisy'
            resetView: () => {
                this.camera.position.set(60, 30, 60);
                this.camera.lookAt(0, 0, 0);
            },
            sine: {
                amplitude: 1.0,
                wavelengthX: 18.0,
                phaseX: 0.0,
                roughness: 0.3,
                roughnessScale: 50.0,
            },
            noise: {
                amplitude: 3.0,
                noiseScale: 15.0,
                seed: 42,
            },
            ndf: {
                bins: 50, // histogram bins per axis
            },
        };
    }

    // ——— HTML Controls Setup
    setupControls() {
        // Surface type switcher
        const surfaceTypeSelect = document.getElementById('surfaceType');
        const sineControls = document.getElementById('sineControls');
        const noiseControls = document.getElementById('noiseControls');

        // Only set up controls if the elements exist (i.e., we're on the surface_visualizer.html page)
        if (!surfaceTypeSelect) {
            return;
        }

        surfaceTypeSelect.addEventListener('change', e => {
            this.params.surfaceType = e.target.value;
            if (this.params.surfaceType === 'Sine') {
                if (sineControls) sineControls.style.display = 'block';
                if (noiseControls) noiseControls.style.display = 'none';
            } else {
                if (sineControls) sineControls.style.display = 'none';
                if (noiseControls) noiseControls.style.display = 'block';
            }
            this.repaint();
        });

        // Sine controls
        const sineAmplitude = document.getElementById('sineAmplitude');
        const sineWavelengthX = document.getElementById('sineWavelengthX');
        const sineRoughness = document.getElementById('sineRoughness');
        const sineRoughnessScale =
            document.getElementById('sineRoughnessScale');

        if (sineAmplitude) {
            sineAmplitude.addEventListener('input', e => {
                this.params.sine.amplitude = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });
        }
        if (sineWavelengthX) {
            sineWavelengthX.addEventListener('input', e => {
                this.params.sine.wavelengthX = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });
        }
        if (sineRoughness) {
            sineRoughness.addEventListener('input', e => {
                this.params.sine.roughness = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });
        }
        if (sineRoughnessScale) {
            sineRoughnessScale.addEventListener('input', e => {
                this.params.sine.roughnessScale = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });
        }

        // Noise controls
        const noiseAmplitude = document.getElementById('noiseAmplitude');
        const noiseScale = document.getElementById('noiseScale');
        const noiseSeed = document.getElementById('noiseSeed');

        if (noiseAmplitude) {
            noiseAmplitude.addEventListener('input', e => {
                this.params.noise.amplitude = parseFloat(e.target.value);
                this.updateNoiseAndHistogram();
            });
        }
        if (noiseScale) {
            noiseScale.addEventListener('input', e => {
                this.params.noise.noiseScale = parseFloat(e.target.value);
                this.updateNoiseAndHistogram();
            });
        }
        if (noiseSeed) {
            noiseSeed.addEventListener('input', e => {
                this.params.noise.seed = parseInt(e.target.value);
                this.updateNoiseAndHistogram();
            });
        }
    }

    // ——— Geometry & materials
    initializeGeometry() {
        this.geo = new THREE.PlaneGeometry(
            this.params.L,
            this.params.L,
            this.params.resolution,
            this.params.resolution
        );
        // Make plane lie on XZ, with normal +Y
        this.geo.rotateX(-Math.PI / 2);

        this.mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.95,
            side: THREE.DoubleSide,
            wireframe: this.params.wireframe,
            vertexColors: true,
        });

        this.mesh = new THREE.Mesh(this.geo, this.mat);
        this.scene.add(this.mesh);

        this.grid = new THREE.GridHelper(600, 120, 0x555555, 0x2a2a2a);
        this.scene.add(this.grid);

        this.pos = this.geo.attributes.position;
        this.N = this.pos.count;
        this.xs = new Float32Array(this.N);
        this.zs = new Float32Array(this.N);
        this.colors = new Float32Array(this.N * 3);
        this.cacheXZ();
    }

    cacheXZ() {
        this.pos = this.geo.attributes.position;
        this.N = this.pos.count;
        this.xs = new Float32Array(this.N);
        this.zs = new Float32Array(this.N);
        for (let i = 0; i < this.N; i++) {
            this.xs[i] = this.pos.getX(i);
            this.zs[i] = this.pos.getZ(i);
        }
    }

    // ——— Color helpers
    colorizeHeight(y, minH, maxH, scheme) {
        const t = (y - minH) / (maxH - minH + 1e-9);
        const c = new THREE.Color();
        if (scheme === 'ocean') {
            c.setHSL(0.66 * (1.0 - t), 0.55, 0.35 + 0.5 * t);
        } else {
            // 'terrain'
            c.setHSL(0.1 + 0.4 * t, 0.7, 0.3 + 0.4 * t);
        }
        return c;
    }

    // ——— Sine surface
    applySineHeights(phaseX = this.params.sine.phaseX) {
        let minH = Infinity,
            maxH = -Infinity;
        const { amplitude, wavelengthX, roughness, roughnessScale } =
            this.params.sine;
        const kx = (2 * Math.PI) / Math.max(1e-6, wavelengthX);

        for (let i = 0; i < this.N; i++) {
            const x = this.xs[i];
            const z = this.pos.getZ(i);

            let y = amplitude * Math.sin(kx * x + phaseX);

            if (roughness > 0) {
                const nf1 = roughnessScale * 0.5;
                const nf2 = roughnessScale * 1.2;
                const nf3 = roughnessScale * 2.8;
                const n1 = Math.sin(nf1 * x + nf1 * z * 0.3);
                const n2 = Math.sin(nf2 * x * 0.7 + nf2 * z);
                const n3 = Math.sin(nf3 * x * 0.4 + nf3 * z * 0.6);
                y += roughness * (0.5 * n1 + 0.3 * n2 + 0.2 * n3);
            }

            this.pos.setY(i, y);
            if (y < minH) minH = y;
            if (y > maxH) maxH = y;
        }

        if (this.params.render) {
            for (let i = 0; i < this.N; i++) {
                const y = this.pos.getY(i);
                const c = this.colorizeHeight(y, minH, maxH, 'ocean');
                const j = 3 * i;
                this.colors[j] = c.r;
                this.colors[j + 1] = c.g;
                this.colors[j + 2] = c.b;
            }
            this.geo.setAttribute(
                'color',
                new THREE.BufferAttribute(this.colors, 3)
            );
            this.pos.needsUpdate = true;
            this.updateGridHeight(amplitude);
        }
        this.geo.computeVertexNormals();
        this.geo.normalsNeedUpdate = true;
    }

    // ——— Noisy surface
    noise2D(x, z, seed = 0) {
        const n =
            Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
        return (n - Math.floor(n)) * 2 - 1; // [-1, 1]
    }

    simpleNoise(x, z, scale, seed) {
        return this.noise2D(x * scale, z * scale, seed);
    }

    applyNoiseHeights(timeOffset = 0) {
        let minH = Infinity,
            maxH = -Infinity;
        const { amplitude, noiseScale, seed } = this.params.noise;
        const scaleFactor = 0.01 / Math.max(1e-6, noiseScale);
        const currentSeed = seed + timeOffset * 1000;

        for (let i = 0; i < this.N; i++) {
            const x = this.xs[i];
            const z = this.zs[i];
            const noiseValue = this.simpleNoise(x, z, scaleFactor, currentSeed);
            const y = amplitude * noiseValue;
            this.pos.setY(i, y);
            if (y < minH) minH = y;
            if (y > maxH) maxH = y;
        }

        if (this.params.render) {
            for (let i = 0; i < this.N; i++) {
                const y = this.pos.getY(i);
                const c = this.colorizeHeight(y, minH, maxH, 'terrain');
                const j = 3 * i;
                this.colors[j] = c.r;
                this.colors[j + 1] = c.g;
                this.colors[j + 2] = c.b;
            }
            this.geo.setAttribute(
                'color',
                new THREE.BufferAttribute(this.colors, 3)
            );
            this.pos.needsUpdate = true;
            this.updateGridHeight(amplitude);
            this.runTests();
        }
        this.geo.computeVertexNormals();
        this.geo.normalsNeedUpdate = true;
    }

    updateGridHeight(activeAmplitude) {
        this.grid.position.y = -activeAmplitude - 0.01;
    }

    // Combined functions that update surface AND histogram
    updateSineAndHistogram(phaseX = this.params.sine.phaseX) {
        this.applySineHeights(phaseX);
        this.createNDFHistogram();
        if (this.params.render) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateNoiseAndHistogram(timeOffset = 0) {
        this.applyNoiseHeights(timeOffset);
        this.createNDFHistogram();
        if (this.params.render) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // Initial paint according to surface type
    repaint() {
        if (this.params.surfaceType === 'Sine') this.updateSineAndHistogram();
        else this.updateNoiseAndHistogram();
    }

    setupEventListeners() {
        addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
            if (this.params.render) {
                this.renderer.render(this.scene, this.camera);
            }
            // Keep Plotly responsive too
            const plotEl = document.getElementById('ndf-histogram');
            if (plotEl && plotEl.data) {
                Plotly.Plots.resize(plotEl);
            }
        });
    }

    render() {
        if (this.params.render) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // ——— NDF implementation (Y-up)
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const n of normals) {
            // With Y-up, spherical mapping gives (sinθ cosφ, sinθ sinφ) == (nx, nz)
            ndfSamples.push({ x: n.x, y: n.z });
        }
        return ndfSamples;
    }

    // Build area-weighted face normals → NDF samples + weights (kept in sync with filtering)
    areaWeightedNDF() {
        const position = this.geo.attributes.position;
        const index = this.geo.index;
        if (!index) {
            return { ndfSamples: [], areaWeights: [], normals: [] };
        }

        const indexArray = index.array;
        const areaWeights = [];
        const normals = [];

        for (let i = 0; i < indexArray.length; i += 3) {
            const a = indexArray[i],
                b = indexArray[i + 1],
                c = indexArray[i + 2];
            const v0 = new THREE.Vector3(
                position.getX(a),
                position.getY(a),
                position.getZ(a)
            );
            const v1 = new THREE.Vector3(
                position.getX(b),
                position.getY(b),
                position.getZ(b)
            );
            const v2 = new THREE.Vector3(
                position.getX(c),
                position.getY(c),
                position.getZ(c)
            );

            const e1 = new THREE.Vector3().subVectors(v1, v0);
            const e2 = new THREE.Vector3().subVectors(v2, v0);
            const cross = new THREE.Vector3().crossVectors(e1, e2);
            const area = cross.length() * 0.5;
            if (area === 0) continue;

            const n = cross.normalize();
            normals.push(n);
            areaWeights.push(area);
        }

        const ndfSamples = [];
        const filteredWeights = [];
        const filteredNormals = [];

        for (let i = 0; i < normals.length; i++) {
            const n = normals[i];
            ndfSamples.push({ x: n.x, y: n.z });
            filteredWeights.push(areaWeights[i]);
            filteredNormals.push(n);
        }

        return {
            ndfSamples,
            areaWeights: filteredWeights,
            normals: filteredNormals,
        };
    }

    createNDFHistogram(plot_id = 'ndf-histogram') {
        const { ndfSamples, areaWeights } = this.areaWeightedNDF();
        const bins = this.params.ndf.bins;
        const histogram = new Array(bins * bins).fill(0);
        const binSize = 2.0 / bins;

        for (let i = 0; i < ndfSamples.length; i++) {
            const sample = ndfSamples[i];
            const weight = areaWeights[i];
            const nx = sample.x;
            const ny = sample.y;
            const binX = Math.floor((nx + 1.0) / binSize);
            const binY = Math.floor((ny + 1.0) / binSize);
            if (binX >= 0 && binX < bins && binY >= 0 && binY < bins) {
                histogram[binY * bins + binX] += weight;
            }
        }
        // render histogram into a canvas, produce a CanvasTexture and (if a DOM target exists) display it

        // create a small offscreen canvas where each bin is one pixel
        const off = document.createElement('canvas');
        off.width = bins;
        off.height = bins;
        const octx = off.getContext('2d');

        // compute max for normalization
        let maxVal = 0;
        for (let i = 0; i < histogram.length; i++) {
            if (histogram[i] > maxVal) maxVal = histogram[i];
        }
        if (maxVal === 0) maxVal = 1.0;

        // draw pixels (flip Y so histogram[0] is bottom-left visually)
        for (let by = 0; by < bins; by++) {
            for (let bx = 0; bx < bins; bx++) {
                const idx = by * bins + bx;
                const v = histogram[idx];
                let t = v / maxVal; // linear [0,1]
                // apply mild log-like compression for better visual contrast
                t = Math.log10(1 + 9 * t) / Math.log10(10);
                // map to color: blue (low) -> cyan -> yellow -> red (high)
                const hue = 240 * (1 - t); // 240 (blue) -> 0 (red)
                const light = 30 + 50 * t; // darker low, brighter high
                // CSS HSL works fine here
                octx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;
                // pixel coordinates: y should be inverted so binY=0 is bottom
                const py = bins - 1 - by;
                octx.fillRect(bx, py, 1, 1);
            }
        }

        // create a display canvas scaled up for readability
        const scale = 4; // change to taste
        const displayW = bins * scale;
        const displayH = bins * scale;
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = displayW;
        displayCanvas.height = displayH;
        const dctx = displayCanvas.getContext('2d');
        // upscale using nearest neighbor so pixels stay crisp
        dctx.imageSmoothingEnabled = false;
        dctx.drawImage(off, 0, 0, displayW, displayH);

        // keep references for later updates
        this._ndfHistogramCanvas = displayCanvas;

        // If there is a DOM element to show the histogram, put the canvas there
        const plotEl = document.getElementById(plot_id);
        if (plotEl) {
            // clear existing content and append the canvas
            plotEl.innerHTML = '';

            // ensure the container will let the canvas stretch to fill it
            plotEl.style.display = 'flex';
            plotEl.style.alignItems = 'stretch';
            plotEl.style.justifyContent = 'stretch';
            plotEl.style.padding = '0';
            plotEl.style.margin = '0';

            // make the canvas fill the container
            displayCanvas.style.display = 'block';
            displayCanvas.style.width = '100%';
            displayCanvas.style.height = '100%';
            displayCanvas.style.maxWidth = 'none';
            displayCanvas.style.maxHeight = 'none';
            displayCanvas.style.boxSizing = 'border-box';

            plotEl.appendChild(displayCanvas);
        }
    }

    getNDFData() {
        return this.areaWeightedNDF();
    }
}
