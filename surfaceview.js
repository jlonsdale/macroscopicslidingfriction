window.addEventListener('load', function () {
    // Initialize surface visualizer when the page loads

    // Check if required elements exist
    const toggleSurfaceBtn = document.getElementById('toggleSurfaceBtn');
    const surfaceControls = document.getElementById('surfaceControls');
    const surfacePanel = document.querySelector('.control-panel-surface');
    const miniView = document.getElementById('miniView');
    const miniCanvas = document.getElementById('miniCanvas');

    if (!toggleSurfaceBtn) {
        return;
    }

    if (!surfaceControls) {
        return;
    }

    // Initialize the surface visualizer in histogram-only mode
    let surfaceVisualizer;
    try {
        surfaceVisualizer = new SurfaceVisualizer(false); // false = histogram only mode
    } catch (error) {
        return;
    }

    // State tracking
    let isVisible = false;

    // Toggle surface controls and histogram
    toggleSurfaceBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        isVisible = !isVisible;

        if (isVisible) {
            // Show controls and expand panel
            surfaceControls.style.display = 'block';
            if (surfacePanel) {
                surfacePanel.classList.add('expanded');
            }
            toggleSurfaceBtn.textContent = 'Hide';

            // Generate the histogram in the miniView area
            try {
                surfaceVisualizer.createNDFHistogram();
            } catch (error) {
                // Silently handle error
            }
        } else {
            // Hide controls and collapse panel
            surfaceControls.style.display = 'none';
            if (surfacePanel) {
                surfacePanel.classList.remove('expanded');
            }
            toggleSurfaceBtn.textContent = 'Show';

            // Clear the histogram
            const histogramPlot = document.getElementById('ndf-histogram');
            if (histogramPlot) {
                histogramPlot.innerHTML = '';
            }
        }
    });

    // Expose surfaceVisualizer globally for console access
    window.surfaceVisualizer = surfaceVisualizer;
});
