// ================================================================
// DIRECTIONAL PROFILE GRAPH - DEBUGGING UTILITIES
// ================================================================

// Global variables for the graph
let graphContainer = null;
let graphCanvas = null;
let graphContext = null;

const createDirectionalProfileGraph = () => {
    // Create graph container
    graphContainer = document.createElement('div');
    graphContainer.id = 'directional-profile-graph';
    graphContainer.style.cssText = `
            position: absolute;
            top: 80px;
            right: 20px;
            width: 350px;
            height: 350px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            z-index: 200;
            font-family: Arial, sans-serif;
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

    // Create title
    const title = document.createElement('h4');
    title.textContent = 'Friction Directional Profile';
    title.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #fff;
    `;
    graphContainer.appendChild(title);

    // Create canvas for the graph
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    canvas.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            margin: auto; 
            display: block;
        `;
    graphContainer.appendChild(canvas);

    // Add to document body
    document.body.appendChild(graphContainer);

    // Store references for updating
    graphCanvas = canvas;
    graphContext = canvas.getContext('2d');

    return {
        container: graphContainer,
        canvas: graphCanvas,
        context: graphContext,
    };
};

const updateDirectionalProfileGraph = profile => {
    if (!graphContext || !profile) return;

    const ctx = graphContext;
    const canvas = graphCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 30;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!profile.angles || !profile.mus || profile.angles.length === 0) {
        // Draw error message
        ctx.fillStyle = '#ff0000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No friction data', centerX, centerY);
        return;
    }

    const angles = profile.angles;
    const mus = profile.mus;

    // Find min/max for scaling
    const minMu = Math.min(...mus);
    const maxMu = Math.max(...mus);
    const muRange = maxMu - minMu || 1; // Avoid division by zero

    // Draw circular grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    // Draw concentric circles
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (i / 4) * maxRadius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // Draw radial lines (every 30 degrees)
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX + Math.cos(angle - Math.PI / 2) * maxRadius,
            centerY + Math.sin(angle - Math.PI / 2) * maxRadius
        );
        ctx.stroke();
    }

    // Draw the friction profile as polar plot
    ctx.strokeStyle = '#00ff88';
    ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
    ctx.lineWidth = 2;

    // Fill area
    ctx.beginPath();
    for (let i = 0; i < angles.length; i++) {
        const normalizedMu = (mus[i] - minMu) / muRange;
        const radius = (normalizedMu * 0.8 + 0.2) * maxRadius; // 20-100% of max radius
        const x = centerX + Math.cos(angles[i] - Math.PI / 2) * radius;
        const y = centerY + Math.sin(angles[i] - Math.PI / 2) * radius;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.fill();

    // Draw outline
    ctx.beginPath();
    for (let i = 0; i < angles.length; i++) {
        const normalizedMu = (mus[i] - minMu) / muRange;
        const radius = (normalizedMu * 0.8 + 0.2) * maxRadius;
        const x = centerX + Math.cos(angles[i] - Math.PI / 2) * radius;
        const y = centerY + Math.sin(angles[i] - Math.PI / 2) * radius;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.stroke();

    // Draw angle labels
    ctx.font = '12px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    const labelRadius = maxRadius + 15;
    for (let i = 0; i < 8; i++) {
        const angle = (i * 45 * Math.PI) / 180;
        const x = centerX + Math.cos(angle - Math.PI / 2) * labelRadius;
        const y = centerY + Math.sin(angle - Math.PI / 2) * labelRadius;
        ctx.fillText(`${i * 45}°`, x, y + 4);
    }

    // Draw value labels
    ctx.textAlign = 'left';
    ctx.font = '11px Arial';
    ctx.fillText(`Min μ: ${minMu.toFixed(3)}`, 10, height - 20);
    ctx.fillText(`Max μ: ${maxMu.toFixed(3)}`, 10, height - 5);

    // Draw center dot
    ctx.fillStyle = '#ff0040';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Draw coordinate system indicator
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.font = '10px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    // North arrow
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 10);
    ctx.lineTo(centerX, centerY - 20);
    ctx.stroke();
    ctx.fillText('0°', centerX, centerY - 25);
};

// Utility functions
const destroyDirectionalProfileGraph = () => {
    if (graphContainer && graphContainer.parentNode) {
        graphContainer.parentNode.removeChild(graphContainer);
    }
    graphContainer = null;
    graphCanvas = null;
    graphContext = null;
};

const toggleDirectionalProfileGraph = () => {
    if (graphContainer) {
        const isVisible = graphContainer.style.display !== 'none';
        graphContainer.style.display = isVisible ? 'none' : 'flex';
    }
};

// Export functions for global access
window.createDirectionalProfileGraph = createDirectionalProfileGraph;
window.updateDirectionalProfileGraph = updateDirectionalProfileGraph;
window.destroyDirectionalProfileGraph = destroyDirectionalProfileGraph;
window.toggleDirectionalProfileGraph = toggleDirectionalProfileGraph;
