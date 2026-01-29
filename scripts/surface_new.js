// Class represents a surface loaded from .obj file with Normal Distribution Function (NDF) analysis
//
// NDF Concept:
// - The NDF is a circular image representing the distribution of microscopic surface normals
// - Uses spherical coordinates with Z-axis as the macroscopic surface normal direction
// - Microscopic normals are mapped as: (x,y,z) = (cos(φ)sin(θ), sin(φ)sin(θ), cos(θ))
// - The Z-coordinate is removed and (x,y) coordinates are placed in a unit circle
// - The intensity represents the fraction of micro-normals pointing in direction (θ,φ)
//
// Coordinate System: Z-up (Z is the surface normal direction)

class Surface {
    constructor(objFile, texturesize, bins = 100) {
        // Constants
        this.bins = bins;
        this.objFile = objFile;

        // Three.js objects - will be set after loading
        this.mesh = null;
        this.texture = null;
        this.texturesize = texturesize;

        // NDF data - will be computed after loading
        this.NDF = null;
        this.areaWeights = null;
        this.ndfSamples = null;
        this.normals = null;

        // Loading promise for async operations
        this.loadingPromise = null;

        this.loadFromOBJ();

        console.log('Surface initialized with .obj file:', {
            objFile: this.objFile ? this.objFile.name : 'none',
            bins: this.bins,
        });
    }

    // Load the .obj file and initialize the surface
    async loadFromOBJ() {
        if (!this.objFile) {
            throw new Error('No .obj file provided');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = event => {
                try {
                    const objText = event.target.result;
                    this.mesh = this.parseOBJ(objText);
                    this.texture = this.generateTexture();

                    // Compute NDF after loading
                    this.NDF = this.areaWeightedNDF();
                    this.areaWeights = this.NDF.areaWeights;
                    this.ndfSamples = this.NDF.ndfSamples;
                    this.normals = this.NDF.normals;

                    console.log('Surface loaded successfully');
                    resolve(this);
                } catch (error) {
                    console.error('Error parsing .obj file:', error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read .obj file'));
            };

            reader.readAsText(this.objFile);
        });
    }

    // Parse .obj file text and create Three.js mesh
    parseOBJ(objText) {
        const vertices = [];
        const faces = [];
        const lines = objText.split('\n');

        for (let line of lines) {
            line = line.trim();

            // Parse vertex positions
            if (line.startsWith('v ')) {
                const parts = line.split(/\s+/);
                vertices.push({
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3]),
                });
            }
            // Parse faces (triangles)
            else if (line.startsWith('f ')) {
                const parts = line.split(/\s+/).slice(1);
                const faceIndices = parts.map(part => {
                    // Handle formats like "v/vt/vn" or "v//vn" or just "v"
                    const indices = part.split('/');
                    return parseInt(indices[0]) - 1; // OBJ indices are 1-based
                });

                // Triangulate if needed (assuming triangulated mesh)
                if (faceIndices.length === 3) {
                    faces.push(faceIndices);
                } else if (faceIndices.length === 4) {
                    // Convert quad to two triangles
                    faces.push([
                        faceIndices[0],
                        faceIndices[1],
                        faceIndices[2],
                    ]);
                    faces.push([
                        faceIndices[0],
                        faceIndices[2],
                        faceIndices[3],
                    ]);
                }
            }
        }

        console.log(
            `Parsed .obj: ${vertices.length} vertices, ${faces.length} faces`
        );

        // Create Three.js geometry
        const geometry = new THREE.BufferGeometry();

        // Convert to BufferGeometry format
        const positions = new Float32Array(faces.length * 3 * 3); // 3 vertices per face, 3 coords per vertex
        const indices = new Uint32Array(faces.length * 3);

        let posIndex = 0;
        for (let i = 0; i < faces.length; i++) {
            const face = faces[i];
            for (let j = 0; j < 3; j++) {
                const vertexIndex = face[j];
                const vertex = vertices[vertexIndex];
                positions[posIndex++] = vertex.x;
                positions[posIndex++] = vertex.y;
                positions[posIndex++] = vertex.z;
                indices[i * 3 + j] = i * 3 + j;
            }
        }

        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3)
        );
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshLambertMaterial({
            map: this.texture,
            color: 0xffffff,
        });

        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    // Generate a simple texture for the loaded surface
    generateTexture() {
        const geometry = this.mesh ? this.mesh.geometry : null;
        if (!geometry || !geometry.attributes.position) {
            // Return a default texture if no geometry available yet
            const canvas = document.createElement('canvas');
            canvas.width = this.texturesize;
            canvas.height = this.texturesize;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(0, 0, this.texturesize, this.texturesize);
            return new THREE.CanvasTexture(canvas);
        }

        const position = geometry.attributes.position;
        const vertexCount = position.count;

        // Find min and max for x, y, z values
        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (let i = 0; i < vertexCount; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        const rangeZ = maxZ - minZ || 1;

        // Create texture with specified size
        const size = 50;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;

        // Map vertices to texture pixels based on their x,y coordinates
        for (let i = 0; i < vertexCount; i++) {
            const vx = position.getX(i);
            const vy = position.getY(i);
            const z = position.getZ(i);

            // Normalize z to 0-255 grayscale and make 10% brighter
            const normalizedZ = Math.min(
                255,
                ((z - minZ) / rangeZ) * 255 * 1.1
            );

            // Map x,y to pixel coordinates based on mesh bounds
            const px = Math.floor(((vx - minX) / rangeX) * (size - 1));
            const py = Math.floor(((vy - minY) / rangeY) * (size - 1));

            if (px >= 0 && px < size && py >= 0 && py < size) {
                const idx = (py * size + px) * 4;
                data[idx] = normalizedZ; // R
                data[idx + 1] = normalizedZ; // G
                data[idx + 2] = normalizedZ; // B
                data[idx + 3] = 255; // A
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return new THREE.CanvasTexture(canvas);
    }

    // ——— NDF implementation (Z-up coordinate system)
    normalsToNdfXY(normals) {
        const ndfSamples = [];
        for (const n of normals) {
            const normal = n.clone().normalize();

            const nz = Math.abs(normal.z);
            const nx = normal.x;
            const ny = normal.y;

            const theta = Math.acos(Math.min(nz, 1.0));
            const phi = Math.atan2(ny, nx);

            const x = Math.cos(phi) * Math.sin(theta);
            const y = Math.sin(phi) * Math.sin(theta);

            ndfSamples.push({ x: x, y: y });
        }
        return ndfSamples;
    }

    // Build area-weighted face normals → NDF samples + weights
    areaWeightedNDF() {
        if (!this.mesh || !this.mesh.geometry) {
            return { ndfSamples: [], areaWeights: [], normals: [] };
        }

        const position = this.mesh.geometry.attributes.position;
        const index = this.mesh.geometry.index;

        if (!index) {
            return { ndfSamples: [], areaWeights: [], normals: [] };
        }

        const indexArray = index.array;
        const areaWeights = [];
        const normals = [];

        for (let i = 0; i < indexArray.length; i += 3) {
            const a = indexArray[i];
            const b = indexArray[i + 1];
            const c = indexArray[i + 2];

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
            const normal = n.clone().normalize();

            const nz = Math.abs(normal.z);
            const nx = normal.x;
            const ny = normal.y;

            const theta = Math.acos(Math.min(nz, 1.0));
            const phi = Math.atan2(ny, nx);

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
        if (!this.ndfSamples || !this.areaWeights) {
            console.warn('NDF data not available yet');
            return;
        }

        const ndfSamples = this.ndfSamples;
        const areaWeights = this.areaWeights;

        const bins = this.bins;
        const histogram = new Array(bins * bins).fill(0);
        const binSize = 2.0 / bins;

        for (let i = 0; i < ndfSamples.length; i++) {
            const sample = ndfSamples[i];
            const weight = areaWeights[i];
            const nx = sample.x;
            const ny = sample.y;

            const frictionConeRadius = 0.6;
            const radius = Math.sqrt(nx * nx + ny * ny);
            if (radius > frictionConeRadius) continue;

            const binX = Math.floor((nx + 1.0) / binSize);
            const binY = Math.floor((ny + 1.0) / binSize);

            if (binX >= 0 && binX < bins && binY >= 0 && binY < bins) {
                histogram[binY * bins + binX] += weight;
            }
        }

        const off = document.createElement('canvas');
        off.width = bins;
        off.height = bins;
        const octx = off.getContext('2d');

        let maxVal = 0;
        for (let i = 0; i < histogram.length; i++) {
            if (histogram[i] > maxVal) maxVal = histogram[i];
        }
        if (maxVal === 0) maxVal = 1.0;

        for (let by = 0; by < bins; by++) {
            for (let bx = 0; bx < bins; bx++) {
                const idx = by * bins + bx;
                const v = histogram[idx];

                const frictionConeRadius = 0.6;
                const binCenterX = (bx + 0.5) * binSize - 1.0;
                const binCenterY = (by + 0.5) * binSize - 1.0;

                let t = v / maxVal;
                t = Math.log10(1 + 9 * t) / Math.log10(10);
                const hue = 240 * (1 - t);
                const light = 30 + 50 * t;
                octx.fillStyle = `hsl(${hue}, 100%, ${light}%)`;

                const py = bins - 1 - by;
                octx.fillRect(bx, py, 1, 1);
            }
        }

        const scale = 10;
        const displayW = bins * scale;
        const displayH = bins * scale;
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = displayW;
        displayCanvas.height = displayH;
        const dctx = displayCanvas.getContext('2d');
        dctx.imageSmoothingEnabled = false;
        dctx.drawImage(off, 0, 0, displayW, displayH);

        this._ndfHistogramCanvas = displayCanvas;

        const plotEl = document.getElementById(plot_id);
        if (plotEl) {
            plotEl.innerHTML = '';
            plotEl.appendChild(displayCanvas);
        }
    }

    // Update mesh texture if needed
    updateTexture() {
        if (this.mesh) {
            this.texture = this.generateTexture();
            this.mesh.material.map = this.texture;
            this.mesh.material.needsUpdate = true;
        }
    }
}
