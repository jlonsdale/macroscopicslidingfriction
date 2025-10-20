// SurfaceVisualizer.js
// Assumes THREE and Plotly are available as globals

class SurfaceVisualizer {
    constructor(render = true) {
        this.renderMode = render;
        this.initializeUIHelpers();
        this.initializeThreeJS();
        this.initializeParams(render);
        this.initializeGeometry();
        this.setupEventListeners();
        this.setupControls();

        // Only do initial repaint if we have the required elements (full mode)
        const hasControls = document.getElementById('surfaceType');
        if (hasControls) {
            this.repaint();
        }

        if (this.params.render) {
            this.render();
        }
    }

    // ——— UI helpers (self-test ticker)
    initializeUIHelpers() {
        this.testsEl = document.getElementById('tests');
        this.ok = name => `<span class="ok">✔</span> ${name}`;
        this.fail = (name, msg = '') =>
            `<span class="fail">✖</span> ${name}${msg ? ': ' + msg : ''}`;
    }

    report(lines) {
        if (this.testsEl)
            this.testsEl.innerHTML =
                '<b>Self-tests</b><br/>' + lines.join('<br/>');
    }

    // ——— Three.js boot
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

        // Only append to DOM if we're in render mode and have a container
        if (app && this.renderMode) {
            app.appendChild(this.renderer.domElement);
        }

        this.scene = new THREE.Scene();
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
                keepHemisphereOnly: true, // filter to +Y (up) hemisphere
                drawUnitCircle: true, // overlay unit circle for sanity
                bins: 100, // histogram bins per axis
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
            this.runTests();
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
    // Map each (unit) normal to the tangent plane axes (X,Z). Optionally keep only +Y hemisphere.
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const n of normals) {
            if (this.params.ndf.keepHemisphereOnly && n.y < 0) continue;
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

            const n = cross.normalize(); // face normal (winding may flip it)
            // Hemisphere filter happens in normalsToNdfXY; but we must keep weights aligned.
            // We'll push now and filter both lists together below.
            normals.push(n);
            areaWeights.push(area);
        }

        // Produce NDF samples with optional hemisphere filtering
        const ndfSamples = [];
        const filteredWeights = [];
        const filteredNormals = [];

        for (let i = 0; i < normals.length; i++) {
            const n = normals[i];
            // Respect hemisphere filter setting
            if (this.params.ndf.keepHemisphereOnly && n.y < 0) continue;
            // map to (nx, nz)
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

    createNDFHistogram() {
        const { ndfSamples, areaWeights } = this.areaWeightedNDF();
        if (!ndfSamples.length) return;

        const ndfX = ndfSamples.map(s => s.x);
        const ndfY = ndfSamples.map(s => s.y);

        // Try to find histogram container, make it visible if found
        const container = document.getElementById('histogram-container');
        if (container) container.style.display = 'block';

        const trace = {
            x: ndfX,
            y: ndfY,
            z: areaWeights, // same length as samples
            type: 'histogram2d',
            colorscale: 'magma',
            showscale: true,
            colorbar: {
                title: { text: 'Density', font: { color: 'white', size: 10 } },
                tickfont: { color: 'white', size: 8 },
                outlinecolor: 'white',
                thickness: 10,
                len: 0.7,
            },
            nbinsx: this.params.ndf.bins,
            nbinsy: this.params.ndf.bins,
            histfunc: 'sum', // sum area per bin
            histnorm: 'probability density', // normalized density
        };

        const layout = {
            title: {
                text: '2D NDF Density (X/Z plane)',
                font: { color: 'white', size: 12 },
            },
            xaxis: {
                title: { text: 'NDF X', font: { size: 10 } },
                titlefont: { color: 'white', size: 10 },
                tickfont: { color: 'white', size: 9 },
                gridcolor: '#444',
                zeroline: true,
                zerolinecolor: 'white',
                zerolinewidth: 1,
                range: [-1, 1],
            },
            yaxis: {
                title: { text: 'NDF Y (Z)', font: { size: 10 } },
                titlefont: { color: 'white', size: 10 },
                tickfont: { color: 'white', size: 9 },
                gridcolor: '#444',
                zeroline: true,
                zerolinecolor: 'white',
                zerolinewidth: 1,
                range: [-1, 1],
                scaleanchor: 'x', // lock aspect so the circle isn't squashed
                scaleratio: 1,
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0.8)',
            font: { color: 'white', size: 10 },
            margin: { l: 40, r: 60, t: 30, b: 40 },
            autosize: true,
        };

        const config = {
            displayModeBar: false, // Hide the toolbar to save space
            displaylogo: false,
            responsive: true, // Make plot responsive
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
        };

        const plotEl = document.getElementById('ndf-histogram');
        if (!plotEl) return;

        const data = [trace];

        // Optional: draw a unit circle to sanity-check the footprint
        if (this.params.ndf.drawUnitCircle) {
            const circleTheta = Array.from(
                { length: 361 },
                (_, i) => (i * Math.PI) / 180
            );
            data.push({
                x: circleTheta.map(t => Math.cos(t)),
                y: circleTheta.map(t => Math.sin(t)),
                mode: 'lines',
                type: 'scatter',
                line: { width: 1 },
                hoverinfo: 'skip',
                showlegend: false,
            });
        }

        Plotly.newPlot(plotEl, data, layout, config).then(() => {
            Plotly.Plots.resize(plotEl); // pass element, not string id
        });
    }
}
