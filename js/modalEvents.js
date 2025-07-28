// modalEvents.js - Handles setting up event listeners for the modal

import { closeModal } from './modal.js';
import { saveImageMetadata, deleteCurrentImage, downloadCurrentWorkflow } from './modalActions.js';

// Setup modal event listeners
export function setupModalEventListeners() {
    const modal = document.getElementById('imageModal');

    // Modal events (using event delegation since content is dynamic)
    modal.addEventListener('click', (e) => {
        // Close modal if clicking the modal background
        if (e.target === modal) {
            closeModal();
        }
        
        // Handle button clicks
        if (e.target.id === 'closeModal') {
            closeModal();
        } else if (e.target.id === 'saveMetadata') {
            saveImageMetadata();
        } else if (e.target.id === 'deleteImage') {
            deleteCurrentImage();
        } else if (e.target.id === 'downloadWorkflow') {
            downloadCurrentWorkflow();
        }
    });
    
    // Handle escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}
