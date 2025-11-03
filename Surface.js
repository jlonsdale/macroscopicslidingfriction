// Surface.js
// A small utility class that represents sinusoidal surfaces.
// Usage:
//   import Surface from './Surface.js'
//   const s = new Surface({ amplitude: 1, wavelength: 2, phase: 0, frequency: 0.5, angle: Math.PI/4 })
//   s.value(x, z, t)      // y value
//   s.normal(x, z, t)     // normal vector [nx, ny, nz]
//   s.sampleGrid(w, d, nx, nz, t) // grid of positions & normals

export default class surface {
    /**
     * @param {object} opts
     *  - amplitude: peak height (A)
     *  - wavelength: wavelength (lambda)
     *  - phase: phase offset (radians)
     *  - frequency: temporal frequency (Hz)
     *  - angle: propagation direction angle in radians (0 = +x)
     */
    constructor(opts = {}) {
        const {
            amplitude = 1,
            wavelength = 1,
            phase = 0,
            frequency = 0,
            angle = 0
        } = opts;

        this.amplitude = amplitude;
        this.wavelength = wavelength;
        this.phase = phase;
        this.frequency = frequency;
        this.angle = angle; // radians

        // derived
        this._k = 2 * Math.PI / this.wavelength;
        this._omega = 2 * Math.PI * this.frequency;
        // direction vector (unit)
        this._dx = Math.cos(this.angle);
        this._dz = Math.sin(this.angle);
    }

    // update derived values when parameters change
    updateParams(opts = {}) {
        Object.assign(this, opts);
        this._k = 2 * Math.PI / this.wavelength;
        this._omega = 2 * Math.PI * this.frequency;
        this._dx = Math.cos(this.angle);
        this._dz = Math.sin(this.angle);
        return this;
    }

    // internal phase at (x,z,t)
    _phaseAt(x, z, t = 0) {
        // dot = k * (x*dx + z*dz) + omega * t + phase
        return this._k * (x * this._dx + z * this._dz) + this._omega * t + this.phase;
    }

    /**
     * y value at (x, z, t)
     */
    value(x = 0, z = 0, t = 0) {
        const p = this._phaseAt(x, z, t);
        return this.amplitude * Math.sin(p);
    }

    /**
     * gradient [dy/dx, dy/dz] at (x, z, t)
     */
    gradient(x = 0, z = 0, t = 0) {
        const p = this._phaseAt(x, z, t);
        const common = this.amplitude * Math.cos(p) * this._k;
        const dy_dx = common * this._dx;
        const dy_dz = common * this._dz;
        return [dy_dx, dy_dz];
    }

    /**
     * normal vector [nx, ny, nz] at (x, z, t) (unit length)
     * For surface y = f(x,z), normal is (-fx, 1, -fz) normalized.
     */
    normal(x = 0, z = 0, t = 0) {
        const [fx, fz] = this.gradient(x, z, t);
        let nx = -fx, ny = 1, nz = -fz;
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
    }

    /**
     * Sample a rectangular grid centered at origin.
     * @param {number} width  full width in x
     * @param {number} depth  full depth in z
     * @param {number} nx     number of samples along x (>=2)
     * @param {number} nz     number of samples along z (>=2)
     * @param {number} t      time
     * @returns {object} { positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array }
     *
     * positions layout: [x,y,z, x,y,z, ...] row-major z then x
     * normals layout:   [nx,ny,nz, ...]
     * uvs layout:       [u,v, ...] in [0,1] space
     * indices: triangles (0-based)
     */
    sampleGrid(width = 1, depth = 1, nx = 10, nz = 10, t = 0) {
        nx = Math.max(2, Math.floor(nx));
        nz = Math.max(2, Math.floor(nz));
        const vx = nx * nz;
        const positions = new Float32Array(vx * 3);
        const normals = new Float32Array(vx * 3);
        const uvs = new Float32Array(vx * 2);
        const indices = new (vx > 65535 ? Uint32Array : Uint16Array)((nx - 1) * (nz - 1) * 6);

        const sx = width / (nx - 1);
        const sz = depth / (nz - 1);
        const halfW = width / 2;
        const halfD = depth / 2;

        let vi = 0;
        for (let iz = 0; iz < nz; iz++) {
            const z = iz * sz - halfD;
            const v = iz / (nz - 1);
            for (let ix = 0; ix < nx; ix++) {
                const x = ix * sx - halfW;
                const u = ix / (nx - 1);
                const y = this.value(x, z, t);
                positions[vi * 3 + 0] = x;
                positions[vi * 3 + 1] = y;
                positions[vi * 3 + 2] = z;
                const n = this.normal(x, z, t);
                normals[vi * 3 + 0] = n[0];
                normals[vi * 3 + 1] = n[1];
                normals[vi * 3 + 2] = n[2];
                uvs[vi * 2 + 0] = u;
                uvs[vi * 2 + 1] = v;
                vi++;
            }
        }

        let ii = 0;
        for (let iz = 0; iz < nz - 1; iz++) {
            for (let ix = 0; ix < nx - 1; ix++) {
                const a = iz * nx + ix;
                const b = a + 1;
                const c = a + nx;
                const d = c + 1;
                // triangle (a, c, b) and (b, c, d)
                indices[ii++] = a;
                indices[ii++] = c;
                indices[ii++] = b;
                indices[ii++] = b;
                indices[ii++] = c;
                indices[ii++] = d;
            }
        }

        return { positions, normals, uvs, indices, width, depth, nx, nz };
    }
}