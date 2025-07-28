// modal.js - Handles image/video modal display and interactions
// v2.6 - Consolidated logging with summary reporting

import { database } from './clientDatabase.js';
import { showNotification } from './utils.js';
import { setCurrentImage, clearCurrentImage } from './modalState.js';
import { cleanupMediaElement, performBatchCleanup } from './mediaCleanup.js';
import { saveImageMetadata, deleteCurrentImage, downloadCurrentWorkflow } from './modalActions.js';
import { setupVideoControls } from './modalVideoControls.js';
import { setupFullSizeHandlers, openFullSizeMedia } from './fullsizeOverlay.js';
import { ensureModalStructure, populateModalUI } from './modalUI.js';
import { setupModalEventListeners } from './modalEvents.js';

export function openImageModal(item, autoplay = false) {
    setCurrentImage(item);
    const modal = document.getElementById('imageModal');
    
    // Get or create the new modal structure
    ensureModalStructure();
    
    // Populate UI elements
    populateModalUI(item, item.mediaType === 'video');

    const modalPreviewVideo = document.getElementById('modalPreviewVideo');
    const isVideo = item.mediaType === 'video';

    // Try to play if autoplay requested
    if (isVideo && autoplay) {
        // Add a small delay to ensure video is loaded
        setTimeout(() => {
            modalPreviewVideo.play().catch(e => {
                console.log('Autoplay blocked by browser, user interaction required:', e);
            });
        }, 100);
    }
    
    // Setup video control handlers
    if (isVideo) {
        setupVideoControls(modalPreviewVideo);
    }
    
    // Set up click handlers for full-size view
    setupFullSizeHandlers(item, isVideo);
    
    modal.style.display = 'block';
}



// Enhanced close modal with consolidated cleanup logging
export function closeModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';
    
    // Silent cleanup with result tracking
    const results = { success: 0, failed: 0, skipped: 0 };
    
    // Clean up modal video
    const modalVideo = document.getElementById('modalPreviewVideo');
    if (modalVideo) {
        cleanupMediaElement(modalVideo, 'modal-video-close', results);
    }
    
    // Clean up modal image
    const modalImage = document.getElementById('modalPreviewImg');
    if (modalImage) {
        cleanupMediaElement(modalImage, 'modal-image-close', results);
    }
    
    // Clean up full-size overlay
    const fullsizeOverlay = document.getElementById('fullsizeOverlay');
    if (fullsizeOverlay && fullsizeOverlay.style.display !== 'none') {
        fullsizeOverlay.style.display = 'none';
        
        const overlayVideo = fullsizeOverlay.querySelector('video');
        const overlayImage = fullsizeOverlay.querySelector('img');
        
        if (overlayVideo) {
            cleanupMediaElement(overlayVideo, 'overlay-video', results);
        }
        if (overlayImage) {
            cleanupMediaElement(overlayImage, 'overlay-image', results);
        }
    }
    
    // Log summary only if we actually cleaned something
    if (results.success > 0 || results.failed > 0) {
        console.log(`🚪 Modal closed: ${results.success} elements cleaned${results.failed > 0 ? `, ${results.failed} failed` : ''}`);
    }
    
    clearCurrentImage();
}
