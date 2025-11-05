// Friction model using NDF slide+integrate overlap, with PEAK (L∞) normalization only
// -----------------------------------------------------------------------------
// What this class does, in one line:
//   It converts micro-normal samples from two contacting surfaces into 2D
//   normal-distribution functions (NDFs), then estimates a direction-dependent
//   friction coefficient μ(u) by integrating the overlap of those NDFs along a
//   chord oriented at direction u. The result is scaled by load and material
//   factors.
//
// Pipeline overview:
//   samples → bin to grid → (optional) blur → PEAK normalize (L∞) →
//   1D overlap integral → scale by k·(FN/Fref)^α·M
//
// Normalization:
//   - ONLY "peak" (L∞) normalization remains (max grid value becomes 1 if nonzero).
//
// Public API summary:
//   - constructor(..., options)
//   - directionalProfile(numDirs)
//   - rebuild(ndfSamples1, areaWeights1, ndfSamples2, areaWeights2)
//
// Options:
//   - bins        (default 64)
//   - k           (default 0.5)
//   - FN          (default 1.0)
//   - Fref        (default 1.0)
//   - alpha       (default 0.2)
//   - M           (default 1.0)
//   - dTheta      (default 0)
//   - taps        (default 256)
//   - blurRadius  : integer bin radius for box blur before normalization (default 0 = off)
//   - blurIters   : how many times to apply the blur (default 1)
//
// Implementation details:
//   - The grid is a bins×bins Float32Array over [-1,1]^2 but we only accumulate
//     and sample inside the unit disk. Sampling uses bilinear filtering.
//   - The 1D overlap integral evaluates ∫ f1(t·u) f2(-t·R(dθ)u) dt for t∈[-1,1],
//     approximated by a uniform Riemann sum over `taps` samples.
// -----------------------------------------------------------------------------

class Friction {
    /**
     * @param {*} surface1                 - optional handle to surface data
     * @param {*} surface2                 - optional handle to surface data
     * @param {number[]} areaWeights1      - per-sample weights for ndfSamples1
     * @param {number[]} areaWeights2      - per-sample weights for ndfSamples2
     * @param {{x:number,y:number}[]} ndfSamples1  - unit-disk coords for surface 1 NDF
     * @param {{x:number,y:number}[]} ndfSamples2  - unit-disk coords for surface 2 NDF
     * @param {THREE.Vector3[]} normals1   - optional raw normals (not used directly)
     * @param {THREE.Vector3[]} normals2   - optional raw normals (not used directly)
     * @param {object} options             - see header above
     */
    constructor(
        surface1,
        surface2,
        areaWeights1,
        areaWeights2,
        ndfSamples1,
        ndfSamples2,
        normals1,
        normals2,
        options = {}
    ) {
        this.surface1 = surface1;
        this.surface2 = surface2;
        this.areaWeights1 = areaWeights1 || [];
        this.areaWeights2 = areaWeights2 || [];
        this.ndfSamples1 = ndfSamples1 || [];
        this.ndfSamples2 = ndfSamples2 || [];
        this.normals1 = normals1 || [];
        this.normals2 = normals2 || [];

        // Parameters
        this.bins = options.bins ?? 100;
        this.k = options.k ?? 3.0;
        this.FN = options.FN ?? 1.0;
        this.Fref = options.Fref ?? 1.0;
        this.alpha = options.alpha ?? 0.3;
        this.M = options.M ?? 1.0;
        this.dTheta = options.dTheta ?? 0.0;
        this.taps = options.taps ?? 256;

        // Build NDF grids (PEAK-normalized)
        this.ndfGrid1 = this._buildGrid(
            this.ndfSamples1,
            this.areaWeights1,
            this.bins
        );
        this.ndfGrid2 = this._buildGrid(
            this.ndfSamples2,
            this.areaWeights2,
            this.bins
        );

        this.loadscaling =
            this.Fref > 0 ? Math.pow(this.FN / this.Fref, this.alpha) : 1.0;
        this.numDirs = 72;
        this.directionalProfileCache = this.directionalProfile();
    }

    // ---------------------------------------------------------------------
    // Public methods
    // ---------------------------------------------------------------------

    directionalProfile() {
        const angles = new Array(this.numDirs);
        const mus = new Array(this.numDirs);

        for (let i = 0; i < this.numDirs; i++) {
            const a = (i / this.numDirs) * Math.PI * 2.0;
            angles[i] = a;
            mus[i] =
                this.k *
                this._overlap1D(a, this.dTheta, this.taps) *
                this.loadscaling *
                this.M;
        }
        this.directionalProfileCache = { angles: angles, mus: mus };
        return this.directionalProfileCache;
    }

    getMuAtAngle(angle) {
        if (!this.directionalProfileCache) {
            this.directionalProfile();
        }
        const index = Math.floor(
            ((angle % (2 * Math.PI)) / (2 * Math.PI)) * this.numDirs
        );
        return this.directionalProfileCache.mus[index];
    }

    /**
     * Rebuild NDFs (e.g., if samples or weights changed). Uses PEAK normalization.
     */
    rebuild(ndfSamples1, areaWeights1, ndfSamples2, areaWeights2) {
        if (ndfSamples1) this.ndfSamples1 = ndfSamples1;
        if (areaWeights1) this.areaWeights1 = areaWeights1;
        if (ndfSamples2) this.ndfSamples2 = ndfSamples2;
        if (areaWeights2) this.areaWeights2 = areaWeights2;
        this.ndfGrid1 = this._buildGrid(
            this.ndfSamples1,
            this.areaWeights1,
            this.bins
        );
        this.ndfGrid2 = this._buildGrid(
            this.ndfSamples2,
            this.areaWeights2,
            this.bins
        );
    }

    // ---------------------------------------------------------------------
    // Core math & helpers (private)
    // ---------------------------------------------------------------------

    /**
     * Build a bins×bins grid; optionally blur; then apply PEAK (L∞) normalization.
     * @returns {Float32Array} grid
     */
    _buildGrid(samples, weights, bins) {
        const grid = new Float32Array(bins * bins);
        const binSize = 2.0 / bins;

        // Accumulate sample weights into bins (ignore samples outside unit disk)
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const w = weights && weights[i] != null ? weights[i] : 1.0;
            const x = s.x,
                y = s.y;
            if (x * x + y * y > 1.0) continue;
            const bx = Math.floor((x + 1.0) / binSize);
            const by = Math.floor((y + 1.0) / binSize);
            if (bx < 0 || bx >= bins || by < 0 || by >= bins) continue;
            grid[by * bins + bx] += w;
        }

        // PEAK (L∞) normalization: max value becomes 1 (if nonzero)
        let maxV = 0.0;
        for (let i = 0; i < grid.length; i++) maxV = Math.max(maxV, grid[i]);
        const s = maxV > 0 ? 1.0 / maxV : 1.0;
        for (let i = 0; i < grid.length; i++) grid[i] *= s;

        return grid;
    }

    /**
     * Bilinear fetch from a grid at (x,y) ∈ [-1,1]^2. Returns 0 outside unit disk.
     */
    _sampleGrid(grid, bins, x, y) {
        if (x * x + y * y > 1.0) return 0.0; // outside disk → no contribution
        // Map [-1,1] → [0, bins-1]
        const u = (x + 1.0) * 0.5 * (bins - 1);
        const v = (y + 1.0) * 0.5 * (bins - 1);
        const x0 = Math.floor(u),
            y0 = Math.floor(v);
        const x1 = Math.min(x0 + 1, bins - 1),
            y1 = Math.min(y0 + 1, bins - 1);
        const tx = u - x0,
            ty = v - y0;
        const idx = (xi, yi) => yi * bins + xi;
        const c00 = grid[idx(x0, y0)],
            c10 = grid[idx(x1, y0)];
        const c01 = grid[idx(x0, y1)],
            c11 = grid[idx(x1, y1)];
        const c0 = c00 * (1 - tx) + c10 * tx;
        const c1 = c01 * (1 - tx) + c11 * tx;
        return c0 * (1 - ty) + c1 * ty;
    }

    /**
     * 1D overlap integral along direction uAngle, with surface2 rotated by dTheta.
     * Evaluates numerically: ∫_{t=-1}^{1} f1(t·u) · f2(-t·R(dθ)u) dt
     */
    _overlap1D(uAngle, dTheta, taps) {
        const g1 = this.ndfGrid1,
            g2 = this.ndfGrid2;
        const bins1 = this.bins,
            bins2 = this.bins;
        const ux = Math.cos(uAngle),
            uy = Math.sin(uAngle);
        const c = Math.cos(dTheta),
            s = Math.sin(dTheta);
        const u2x = c * ux - s * uy,
            u2y = s * ux + c * uy;
        const tMax = 1.0; // half-extent of integration domain
        const dt = (2 * tMax) / Math.max(1, taps - 1);
        let sum = 0.0;
        for (let i = 0; i < taps; i++) {
            const t = -tMax + i * dt;
            const x1 = t * ux,
                y1 = t * uy; // surface 1
            const x2 = -t * u2x,
                y2 = -t * u2y; // surface 2 (mirrored & rotated)
            const f1 = this._sampleGrid(g1, bins1, x1, y1);
            const f2 = this._sampleGrid(g2, bins2, x2, y2);
            sum += f1 * f2;
        }
        return sum * dt;
    }
}
