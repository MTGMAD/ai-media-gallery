// mediaCleanup.js - Utility functions for cleaning up media elements and revoking blob URLs

// Enhanced media cleanup utility function - SILENT WITH RESULT TRACKING
export function cleanupMediaElement(element, elementType = 'unknown', trackResults = null) {
    if (!element) {
        if (trackResults) trackResults.skipped++;
        return false;
    }
    
    try {
        // For video elements
        if (element.tagName === 'VIDEO' || elementType.includes('video')) {
            // Pause the video first
            if (typeof element.pause === 'function') {
                element.pause();
            }
            
            // Remove all event listeners to prevent further errors
            element.onloadstart = null;
            element.onloadeddata = null;
            element.onerror = null;
            element.onended = null;
            element.onplay = null;
            element.onpause = null;
            element.oncanplay = null;
            element.onloadedmetadata = null;
            element.onstalled = null;
            element.onsuspend = null;
            element.onabort = null;
            element.onemptied = null;
            
            // IMPORTANT: Handle source elements BEFORE clearing main src
            const sources = element.querySelectorAll('source');
            sources.forEach(source => {
                // Add silent error handler to source elements
                source.onerror = () => {};
                source.onabort = () => {};
                // Remove the source element entirely instead of just clearing src
                if (source.parentNode) {
                    source.parentNode.removeChild(source);
                }
            });
            
            // Clear the main video source
            const currentSrc = element.src;
            if (currentSrc && currentSrc.startsWith('blob:')) {
                URL.revokeObjectURL(currentSrc);
            }
            
            // Add comprehensive silent error handler BEFORE clearing src
            element.onerror = () => {};
            element.onabort = () => {};
            element.onstalled = () => {};
            element.onsuspend = () => {};
            element.onemptied = () => {};
            
            // Clear main source
            element.src = '';
            element.removeAttribute('src');
            
            // Call load() to cancel any pending network requests
            if (typeof element.load === 'function') {
                element.load();
            }
            
            // Additional cleanup - briefly hide the element to force browser cleanup
            const originalDisplay = element.style.display;
            element.style.display = 'none';
            // Use requestAnimationFrame to ensure the display change is processed
            requestAnimationFrame(() => {
                element.style.display = originalDisplay;
            });
        }
        
        // For image elements
        if (element.tagName === 'IMG' || elementType.includes('image')) {
            const currentSrc = element.src;
            if (currentSrc && currentSrc.startsWith('blob:')) {
                URL.revokeObjectURL(currentSrc);
            }
            
            // Add silent error handler
            element.onerror = () => {};
            element.onload = () => {};
            element.onabort = () => {};
            
            element.src = '';
            element.removeAttribute('src');
        }
        
        if (trackResults) trackResults.success++;
        return true;
    } catch (cleanupError) {
        if (trackResults) trackResults.failed++;
        return false;
    }
}

// Batch cleanup function with summary reporting
export function performBatchCleanup(elements, elementType, description) {
    if (!elements || elements.length === 0) return;
    
    const results = { success: 0, failed: 0, skipped: 0 };
    
    elements.forEach(element => {
        cleanupMediaElement(element, elementType, results);
    });
    
    const total = results.success + results.failed + results.skipped;
    if (total > 0) {
        console.log(`🧹 ${description}: ${total} elements processed (✅ ${results.success} cleaned, ❌ ${results.failed} failed, ⏭️ ${results.skipped} skipped)`);
    }
    
    return results;
}
