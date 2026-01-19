const useLogScale = true; // Default to true, can be made configurable

class WaveSurface {
    constructor(wavetype) {
        // Initialize wave parameters first
        this.numberOfWaves = wavetype.numberOfWaves;
        this.amplitudes = wavetype.amplitudes;
        this.wavelengths = wavetype.wavelengths;
        this.noiseLevels = wavetype.noiseLevels;
        this.orientations = wavetype.orientations;
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
        const geometry = new THREE.PlaneGeometry(1000, 1000, 128, 128);
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

    saveSurfaceAsOBJ() {
        const exporter = new THREE.OBJExporter();
        const objData = exporter.parse(this.mesh);
        const blob = new Blob([objData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'wave_surface.obj';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    getSurfaceParams() {
        //return number of waves, amplitudes, wavelengths, noise levels, orientations in a pretty print
        const params = {
            numberOfWaves: this.numberOfWaves,
            amplitudes: this.amplitudes,
            wavelengths: this.wavelengths,
            noiseLevels: this.noiseLevels,
            orientations: this.orientations,
        };
        return JSON.stringify(params, null, 2);
    }

    // ——— NDF implementation (Z-up coordinate system)
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const n of normals) {
            const normal = n.clone().normalize();
            const nz = Math.abs(normal.z); // Ensure positive for upper hemisphere
            const nx = normal.x;
            const ny = normal.y;
            const theta = Math.acos(Math.min(nz, 1.0)); // Clamp to avoid numerical errors
            const phi = Math.atan2(ny, nx);
            const x = Math.cos(phi) * Math.sin(theta);
            const y = Math.sin(phi) * Math.sin(theta);
            ndfSamples.push({ x: x, y: y });
        }
        return ndfSamples;
    }

    calcRMSRoughness() {
        const positions = this.mesh.geometry.attributes.position;
        let sum = 0;
        let sumSq = 0;
        let count = 0;

        for (let i = 2; i < positions.count; i += 3) {
            const z = positions.getZ(i);
            sum += z;
            sumSq += z * z;
            count++;
        }

        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        return Math.sqrt(Math.max(variance, 0));
    }

    // Build area-weighted face normals → NDF samples + weights (kept in sync with filtering)
    areaWeightedNDF() {
        const position = this.mesh.geometry.attributes.position;
        const index = this.mesh.geometry.index;
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
            // Convert normal to proper NDF coordinates using spherical mapping
            // Ensure normal is normalized
            const normal = n.clone().normalize();

            // Assuming Z-up coordinate system (nz should be positive for hemisphere)
            const nz = Math.abs(normal.z); // Ensure positive for upper hemisphere
            const nx = normal.x;
            const ny = normal.y;

            // Convert to spherical coordinates
            const theta = Math.acos(Math.min(nz, 1.0)); // Angle from Z-axis
            const phi = Math.atan2(ny, nx); // Azimuthal angle

            // Map to NDF coordinates: (cos(φ)sin(θ), sin(φ)sin(θ))
            const x = Math.cos(phi) * Math.sin(theta);
            const y = Math.sin(phi) * Math.sin(theta);

            ndfSamples.push({ x: x, y: y });
            filteredWeights.push(areaWeights[i]);
            filteredNormals.push(n);
        }

        this.ndfSamples = ndfSamples;
        this.areaWeights = filteredWeights;
        this.normals = filteredNormals;

        return {
            ndfSamples,
            areaWeights: filteredWeights,
            normals: filteredNormals,
        };
    }

    createNDFHistogram(plot_id) {
        const ndfSamples = this.ndfSamples;
        const areaWeights = this.areaWeights;

        const bins = this.bins;
        const histogram = new Array(bins * bins).fill(0);
        const binSize = 2.0 / bins;

        for (let i = 0; i < ndfSamples.length; i++) {
            const sample = ndfSamples[i];
            const weight = areaWeights[i];
            const nx = sample.x; // cos(φ)sin(θ) - NDF coordinate
            const ny = sample.y; // sin(φ)sin(θ) - NDF coordinate

            // Map to histogram bins - centered at origin with radius constraint
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
                // Inside unit circle - render NDF data
                let t = v / maxVal; // linear [0,1]
                // Apply mild log-like compression for better visual contrast (controlled by flag)
                if (useLogScale) {
                    t = Math.log10(1 + 9 * t) / Math.log10(10);
                }

                // map to color: blue (low) -> cyan -> yellow -> red (high)
                const hue = 240 * (1 - t); // 240 (blue) -> 0 (red)
                const light = 30 + 50 * t; // darker low, brighter high
                octx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;

                // pixel coordinates: y should be inverted so binY=0 is bottom
                const py = bins - 1 - by;
                octx.fillRect(bx, py, 1, 1);
            }
        }

        // create a display canvas with fixed size independent of bin count
        const displayW = 580; // Fixed width
        const displayH = 580; // Fixed height
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = displayW;
        displayCanvas.height = displayH;
        const dctx = displayCanvas.getContext('2d');
        // upscale using nearest neighbor so pixels stay crisp
        dctx.imageSmoothingEnabled = false;
        dctx.drawImage(off, 0, 0, displayW, displayH);

        // Draw surface parameters text on top of the histogram
        dctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent background
        dctx.fillRect(5, 5, displayW - 10, 95);

        dctx.fillStyle = 'white';
        dctx.font = '12px Arial';
        dctx.textAlign = 'left';

        // Format parameters in readable way
        let yPos = 20;
        dctx.fillText(`Waves: ${this.numberOfWaves}`, 10, yPos);
        yPos += 15;
        dctx.fillText(`Amplitudes: [${this.amplitudes.join(', ')}]`, 10, yPos);
        yPos += 15;
        dctx.fillText(
            `Wavelengths: [${this.wavelengths.join(', ')}]`,
            10,
            yPos
        );
        yPos += 15;
        dctx.fillText(`Noise: [${this.noiseLevels.join(', ')}]`, 10, yPos);
        yPos += 15;
        const orientationsDeg = this.orientations.map(o =>
            Math.round((o * 180) / Math.PI)
        );
        dctx.fillText(
            `Orientations: [${orientationsDeg.join('°, ')}°]`,
            10,
            yPos
        );
        dctx.fillText(
            `RMS Roughness: ${this.calcRMSRoughness().toFixed(4)} px`,
            10,
            yPos + 15
        );

        // keep references for later updates
        this._ndfHistogramCanvas = displayCanvas;

        // If there is a DOM element to show the histogram, put the canvas there
        const plotEl = document.getElementById(plot_id);
        if (plotEl) {
            // clear existing content and append the canvas
            plotEl.innerHTML = '';

            // Add the title back
            const title = document.createElement('h3');
            title.textContent = 'NDF Histogram';
            title.style.color = 'white';
            title.style.margin = '0 0 10px 0';
            title.style.fontFamily = 'Arial, sans-serif';
            title.style.fontSize = '14px';
            plotEl.appendChild(title);

            // Add the canvas with parameters drawn on top
            plotEl.appendChild(displayCanvas);
        }
    }
}
