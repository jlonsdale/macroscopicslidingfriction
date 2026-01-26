class WaveSurface {
    constructor(wavetype, asperities = []) {
        // Initialize wave parameters first
        this.numberOfWaves = wavetype.numberOfWaves;
        this.amplitudes = wavetype.amplitudes;
        this.wavelengths = wavetype.wavelengths;
        this.noiseLevels = wavetype.noiseLevels;
        this.orientations = wavetype.orientations;
        this.asperities = asperities;
        this.mesh = this.generateSurface();

        this.bins = 100; // Number of bins for NDF histogram

        // Precompute NDF samples and area weights
        const ndfData = this.areaWeightedNDF();
        this.ndfSamples = ndfData.ndfSamples;
        this.areaWeights = ndfData.areaWeights;
    }

    //generate a surface made from superpositions of sine waves going in different directions
    //return a mesh object
    generateSurface() {
        const geometry = new THREE.PlaneGeometry(2000, 2000, 128, 128);
        const vertices = geometry.attributes.position.array;

        // one fixed phase per wave (not per vertex!)
        const phases = Array.from(
            { length: this.numberOfWaves },
            () => Math.random() * 2 * Math.PI
        );

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            let z = 0;

            // Add waves
            for (let j = 0; j < this.numberOfWaves; j++) {
                const amplitude = this.amplitudes[j % this.amplitudes.length];
                const wavelength =
                    this.wavelengths[j % this.wavelengths.length];
                const noiseLevel =
                    this.noiseLevels[j % this.noiseLevels.length];
                const orientation =
                    this.orientations[j % this.orientations.length];

                const k = (2 * Math.PI) / wavelength;
                const phase = phases[j];

                const wave =
                    amplitude *
                    Math.sin(
                        k *
                            (x * Math.cos(orientation) +
                                y * Math.sin(orientation)) +
                            phase
                    );

                const noise = (Math.random() - 0.5) * noiseLevel;

                z += wave + noise;
            }

            // Add asperities (sharp peaks using Gaussian function)
            for (const asp of this.asperities) {
                const dx = x - asp.x;
                const dy = y - asp.y;
                const distSq = dx * dx + dy * dy;
                const sigma = asp.width;

                // Gaussian peak: height * exp(-dist^2 / (2*sigma^2))
                const asperityHeight =
                    asp.height * Math.exp(-distSq / (2 * sigma * sigma));
                z += asperityHeight;
            }

            vertices[i + 2] = z;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
            color: 0x5566aa,
            wireframe: false,
        });

        return new THREE.Mesh(geometry, material);
    }

    // ——— NDF implementation (Z-up coordinate system)
    normalsToNdfXY(normals) {
        // Take (nx, ny, nz) → place in unit circle as (nx/sqrt(nx²+ny²+nz²), ny/sqrt(nx²+ny²+nz²))
        // effectively projecting from sphere onto XY plane ignoring Z
        const ndfXY = [];
        for (const n of normals) {
            const mag = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
            if (mag > 1e-9) {
                ndfXY.push({ x: n.x / mag, y: n.y / mag });
            }
        }
        return ndfXY;
    }

    // Build area-weighted face normals → NDF samples + weights
    areaWeightedNDF() {
        const geometry = this.mesh.geometry;
        const positions = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;

        const normals = [];
        const areas = [];

        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i] * 3;
                const i1 = indices[i + 1] * 3;
                const i2 = indices[i + 2] * 3;

                const v0 = new THREE.Vector3(
                    positions[i0],
                    positions[i0 + 1],
                    positions[i0 + 2]
                );
                const v1 = new THREE.Vector3(
                    positions[i1],
                    positions[i1 + 1],
                    positions[i1 + 2]
                );
                const v2 = new THREE.Vector3(
                    positions[i2],
                    positions[i2 + 1],
                    positions[i2 + 2]
                );

                const e1 = new THREE.Vector3().subVectors(v1, v0);
                const e2 = new THREE.Vector3().subVectors(v2, v0);
                const cross = new THREE.Vector3().crossVectors(e1, e2);
                const area = cross.length() * 0.5;

                if (area > 1e-12) {
                    cross.normalize();
                    normals.push(cross);
                    areas.push(area);
                }
            }
        } else {
            // Non-indexed
            for (let i = 0; i < positions.length; i += 9) {
                const v0 = new THREE.Vector3(
                    positions[i],
                    positions[i + 1],
                    positions[i + 2]
                );
                const v1 = new THREE.Vector3(
                    positions[i + 3],
                    positions[i + 4],
                    positions[i + 5]
                );
                const v2 = new THREE.Vector3(
                    positions[i + 6],
                    positions[i + 7],
                    positions[i + 8]
                );

                const e1 = new THREE.Vector3().subVectors(v1, v0);
                const e2 = new THREE.Vector3().subVectors(v2, v0);
                const cross = new THREE.Vector3().crossVectors(e1, e2);
                const area = cross.length() * 0.5;

                if (area > 1e-12) {
                    cross.normalize();
                    normals.push(cross);
                    areas.push(area);
                }
            }
        }

        const ndfSamples = this.normalsToNdfXY(normals);
        return { ndfSamples, areaWeights: areas, normals };
    }

    createNDFHistogram(plot_id, useLogScale = false) {
        const container = document.getElementById(plot_id);
        if (!container) {
            console.warn('NDF plot container not found');
            return;
        }

        const bins = this.bins;
        const size = 400;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.style.border = '1px solid #555';
        canvas.style.borderRadius = '5px';

        const ctx = canvas.getContext('2d');

        // Clear background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, size, size);

        // Build 2D histogram
        const gridSize = bins;
        const histogram = Array(gridSize)
            .fill(0)
            .map(() => Array(gridSize).fill(0));

        for (let i = 0; i < this.ndfSamples.length; i++) {
            const sample = this.ndfSamples[i];
            const weight = this.areaWeights[i];

            // Map [-1,1] → [0, gridSize-1]
            const binX = Math.floor(((sample.x + 1) / 2) * gridSize);
            const binY = Math.floor(((sample.y + 1) / 2) * gridSize);

            const clampedX = Math.max(0, Math.min(gridSize - 1, binX));
            const clampedY = Math.max(0, Math.min(gridSize - 1, binY));

            histogram[clampedY][clampedX] += weight;
        }

        // Find max for normalization
        let maxVal = 0;
        for (let row of histogram) {
            for (let val of row) {
                if (val > maxVal) maxVal = val;
            }
        }

        // Draw histogram with color mapping (blue to red heatmap)
        const cellSize = size / gridSize;
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                let intensity = histogram[row][col] / maxVal;
                if (useLogScale && intensity > 0) {
                    intensity = Math.log(1 + intensity * 9) / Math.log(10);
                }

                // Color mapping: blue (low) -> cyan -> green -> yellow -> red (high)
                let r, g, b;
                if (intensity < 0.25) {
                    // Blue to Cyan
                    const t = intensity / 0.25;
                    r = 0;
                    g = Math.floor(t * 255);
                    b = 255;
                } else if (intensity < 0.5) {
                    // Cyan to Green
                    const t = (intensity - 0.25) / 0.25;
                    r = 0;
                    g = 255;
                    b = Math.floor((1 - t) * 255);
                } else if (intensity < 0.75) {
                    // Green to Yellow
                    const t = (intensity - 0.5) / 0.25;
                    r = Math.floor(t * 255);
                    g = 255;
                    b = 0;
                } else {
                    // Yellow to Red
                    const t = (intensity - 0.75) / 0.25;
                    r = 255;
                    g = Math.floor((1 - t) * 255);
                    b = 0;
                }

                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(
                    col * cellSize,
                    row * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }

        // Clear and add title + canvas
        container.innerHTML = '<h3>Normal Distribution Function</h3>';
        container.appendChild(canvas);
    }
}
