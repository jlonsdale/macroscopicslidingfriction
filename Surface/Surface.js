// Class represents sinusoidal surface with Normal Distribution Function (NDF) analysis
//
// NDF Concept:
// - The NDF is a circular image representing the distribution of microscopic surface normals
// - Uses spherical coordinates with Z-axis as the macroscopic surface normal direction
// - Microscopic normals are mapped as: (x,y,z) = (cos(φ)sin(θ), sin(φ)sin(θ), cos(θ))
// - The Z-coordinate is removed and (x,y) coordinates are placed in a unit circle
// - The intensity represents the fraction of micro-normals pointing in direction (θ,φ)
//
// Coordinate System: Z-up (Z is the surface normal direction)

// Top-down view:

//   |#  #  # | In tangent space - this represents a rotation of 0
//   |#  #  # |
//   |#  #  # |
//   |#  #  # |

//   |########| In tangent space - this represents a rotation of 90
//   |        |
//   |########|
//   |        |

class Surface {
    constructor(amplitude, wavelengthX, noise, rotation) {
        //surface variables
        this.amplitude = amplitude;
        this.wavelengthX = wavelengthX;
        this.noise = noise;
        this.rotation = rotation;
        //constants

        this.width = 500;
        this.height = 500;
        this.bins = 100;

        //Three.js objects
        this.mesh = this.generateSurface();
        this.texture = this.generateTexture(this.width, this.height);

        //NDF data
        this.NDF = this.areaWeightedNDF();
        this.areaWeights = this.NDF.areaWeights;
        this.ndfSamples = this.NDF.ndfSamples;
        this.normals = this.NDF.normals;
    }

    generateSurface() {
        const geometry = new THREE.PlaneGeometry(
            this.width,
            this.height,
            100,
            100
        );
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];

            // Apply rotation to the coordinate system before calculating the wave
            const cosR = Math.cos(this.rotation);
            const sinR = Math.sin(this.rotation);
            const rotatedX = x * cosR - y * sinR;

            const wave =
                this.amplitude *
                Math.sin(((2 * Math.PI) / this.wavelengthX) * rotatedX);
            vertices[i + 2] = wave;
            vertices[i + 2] += (Math.random() - 0.5) * this.noise;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
            map: this.texture,
            color: 0xffffff, // White to let texture show through
        });

        // Rotate the geometry to be flat on Z-axis
        // geometry.rotateX(-Math.PI / 2);

        const mesh = new THREE.Mesh(geometry, material);

        return mesh;
    }

    generateTexture(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        const imageData = context.createImageData(width, height);
        const data = imageData.data;

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const normalizedX = (x / width) * this.width - this.width / 2;
                const normalizedY =
                    (y / this.height) * this.height - this.height / 2;

                // Apply rotation to texture coordinates too
                const cosR = Math.cos(this.rotation);
                const sinR = Math.sin(this.rotation);
                const rotatedNormX = normalizedX * cosR - normalizedY * sinR;

                const wave =
                    this.amplitude *
                    Math.sin(((2 * Math.PI) / this.wavelengthX) * rotatedNormX);

                // Create more interesting texture with height-based coloring
                const height = wave + (Math.random() - 0.5) * this.noise;
                const normalizedHeight = (height / this.amplitude + 1) * 0.5;

                // Color based on height: darker in valleys, lighter on peaks
                const baseIntensity = Math.floor(normalizedHeight * 180 + 50);
                const red = Math.min(255, baseIntensity + 30);
                const green = Math.min(255, baseIntensity + 10);
                const blue = Math.max(50, baseIntensity - 20);

                const index = (y * width + x) * 4;
                data[index] = red; // Red
                data[index + 1] = green; // Green
                data[index + 2] = blue; // Blue
                data[index + 3] = 255; // Alpha
            }
        }

        context.putImageData(imageData, 0, 0);
        return new THREE.CanvasTexture(canvas);
    }

    // ——— NDF implementation (Z-up coordinate system)
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const n of normals) {
            const normal = n.clone().normalize();

            const nz = Math.abs(normal.z); // Ensure positive for upper hemisphere
            const nx = normal.x;
            const ny = normal.y;

            // Convert to spherical coordinates
            // θ (theta) = angle from Z-axis (surface normal direction)
            // φ (phi) = azimuthal angle in XY plane
            const theta = Math.acos(Math.min(nz, 1.0)); // Clamp to avoid numerical errors
            const phi = Math.atan2(ny, nx);

            // Map to NDF coordinates: (cos(φ)sin(θ), sin(φ)sin(θ))
            // This creates the circular projection where z-coordinate is removed

            const x = Math.cos(phi) * Math.sin(theta);
            const y = Math.sin(phi) * Math.sin(theta);

            ndfSamples.push({ x: x, y: y });
        }
        return ndfSamples;
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

            // Check if sample is within friction cone (smaller radius than unit circle)
            const frictionConeRadius = 0.6; // Adjust this value to change cone size (0.6 = ~37° half-angle)
            const radius = Math.sqrt(nx * nx + ny * ny);
            if (radius > frictionConeRadius) continue; // Skip samples outside friction cone

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

                // Check if this bin is within the friction cone for NDF visualization
                const frictionConeRadius = 0.6; // Match the radius used in histogram creation
                const binCenterX = (bx + 0.5) * binSize - 1.0;
                const binCenterY = (by + 0.5) * binSize - 1.0;
                const binRadius = Math.sqrt(
                    binCenterX * binCenterX + binCenterY * binCenterY
                );

                // Inside unit circle - render NDF data
                let t = v / maxVal; // linear [0,1]
                // apply mild log-like compression for better visual contrast
                t = Math.log10(1 + 9 * t) / Math.log10(10);
                // map to color: blue (low) -> cyan -> yellow -> red (high)
                const hue = 240 * (1 - t); // 240 (blue) -> 0 (red)
                const light = 30 + 50 * t; // darker low, brighter high
                octx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;

                // pixel coordinates: y should be inverted so binY=0 is bottom
                const py = bins - 1 - by;
                octx.fillRect(bx, py, 1, 1);
            }
        }

        // create a display canvas scaled up for readability
        const scale = 10; // change to taste
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
            plotEl.appendChild(displayCanvas);
        }
    }
}
