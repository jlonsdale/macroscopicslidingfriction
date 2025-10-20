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
                sineControls.style.display = 'block';
                noiseControls.style.display = 'none';
            } else {
                sineControls.style.display = 'none';
                noiseControls.style.display = 'block';
            }
            this.repaint();
        });

        // Sine controls
        document
            .getElementById('sineAmplitude')
            .addEventListener('input', e => {
                this.params.sine.amplitude = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });

        document
            .getElementById('sineWavelengthX')
            .addEventListener('input', e => {
                this.params.sine.wavelengthX = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });

        document
            .getElementById('sineRoughness')
            .addEventListener('input', e => {
                this.params.sine.roughness = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });

        document
            .getElementById('sineRoughnessScale')
            .addEventListener('input', e => {
                this.params.sine.roughnessScale = parseFloat(e.target.value);
                this.updateSineAndHistogram();
            });

        // Noise controls
        document
            .getElementById('noiseAmplitude')
            .addEventListener('input', e => {
                this.params.noise.amplitude = parseFloat(e.target.value);
                this.updateNoiseAndHistogram();
            });

        document.getElementById('noiseScale').addEventListener('input', e => {
            this.params.noise.noiseScale = parseFloat(e.target.value);
            this.updateNoiseAndHistogram();
        });

        document.getElementById('noiseSeed').addEventListener('input', e => {
            this.params.noise.seed = parseInt(e.target.value);
            this.updateNoiseAndHistogram();
        });
    }

    // ——— Geometry & materials
    initializeGeometry() {
        this.geo = new THREE.PlaneGeometry(
            this.params.L,
            this.params.L,
            this.params.resolution,
            this.params.resolution
        );
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

    // ——— Sine surface (from original)
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

    // ——— Noisy surface (from original)
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
        const scaleFactor = 0.01 / noiseScale;
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
        });
    }

    render() {
        if (this.params.render) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // ——— NDF implementation (shared)
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const normal of normals) {
            const x = normal.x;
            const y = normal.y;
            const z = Math.max(-1, Math.min(1, normal.z));
            const theta = Math.acos(z);
            const phi = Math.atan2(y, x);
            const ndfX = Math.cos(phi) * Math.sin(theta);
            const ndfY = Math.sin(phi) * Math.sin(theta);
            ndfSamples.push({ x: ndfX, y: ndfY });
        }
        return ndfSamples;
    }

    areaWeightedNDF() {
        const position = this.geo.attributes.position;
        const index = this.geo.index;
        if (!index) {
            return { ndfSamples: [], areaWeights: [] };
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
            const area = cross.length() / 2;
            if (area === 0) continue;
            const normal = cross.normalize();
            normals.push(normal);
            areaWeights.push(area);
        }
        const ndfXY = this.normalsToNdfXY(normals);
        return { ndfSamples: ndfXY, areaWeights, normals };
    }

    createNDFHistogram() {
        const { ndfSamples, areaWeights } = this.areaWeightedNDF();
        if (!ndfSamples.length) return;
        const ndfX = ndfSamples.map(s => s.x);
        const ndfY = ndfSamples.map(s => s.y);

        // Try to find histogram container, make it visible if found
        const container = document.getElementById('histogram-container');
        if (container) {
            container.style.display = 'block';
        }
        const trace = {
            x: ndfX,
            y: ndfY,
            z: areaWeights,
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
            nbinsx: 100,
            nbinsy: 100,
            histfunc: 'sum',
            histnorm: 'probability density',
        };
        const layout = {
            title: {
                text: '2D NDF Density Histogram',
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
            },
            yaxis: {
                title: { text: 'NDF Y', font: { size: 10 } },
                titlefont: { color: 'white', size: 10 },
                tickfont: { color: 'white', size: 9 },
                gridcolor: '#444',
                zeroline: true,
                zerolinecolor: 'white',
                zerolinewidth: 1,
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

        // Use responsive plotting
        Plotly.newPlot('ndf-histogram', [trace], layout, config).then(() => {
            // Force a resize to ensure proper fitting
            Plotly.Plots.resize('ndf-histogram');
        });
    }

    runTests() {
        const lines = [];
        try {
            lines.push(
                this.ok(`Vertices: ${(this.params.resolution + 1) ** 2}`)
            );
        } catch (e) {
            lines.push(this.fail('Tests errored', e.message || e));
        }
        this.report(lines);
    }
}

// Expose for console access
window.THREE = THREE;
