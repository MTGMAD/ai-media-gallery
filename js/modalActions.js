// modalActions.js - Handles actions performed within the modal (save, delete, download)

import { database } from './clientDatabase.js';
import { showNotification, showConfirmDialog, downloadBlob, generateSafeFilename } from './utils.js';
import { getCurrentImageData, getCurrentImageId } from './modalState.js';
import { cleanupMediaElement, performBatchCleanup } from './mediaCleanup.js';
import { closeModal } from './modal.js'; // Import closeModal from the main modal file

// Save metadata (works for both images and videos)
export async function saveImageMetadata() {
    const currentImageId = getCurrentImageId();
    if (!currentImageId) return;
    
    const updatedData = {
        title: document.getElementById('imageTitle').value,
        prompt: document.getElementById('imagePrompt').value,
        model: document.getElementById('imageModel').value,
        tags: document.getElementById('imageTags').value,
        notes: document.getElementById('imageNotes').value
    };
    
    try {
        await database.updateMedia(currentImageId, updatedData);
        
        // Update the title in the modal
        const modalMediaTitle = document.getElementById('modalMediaTitle');
        if (modalMediaTitle) {
            modalMediaTitle.textContent = updatedData.title || 'Untitled';
        }
        
        // Trigger reload in main app
        window.dispatchEvent(new CustomEvent('mediaUpdated'));
        
        showNotification('Changes saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving metadata:', error);
        showNotification('Error saving changes: ' + error.message, 'error');
    }
}

// Delete current item (works for both images and videos) - CONSOLIDATED LOGGING
export async function deleteCurrentImage() {
    const currentImageId = getCurrentImageId();
    const currentImageData = getCurrentImageData();
    if (!currentImageId) return;
    
    const mediaType = currentImageData.mediaType === 'video' ? 'video' : 'image';
    
    // Show custom confirmation dialog
    const confirmed = await showConfirmDialog(`Are you sure you want to delete this ${mediaType}?`);
    if (confirmed) {
        try {
            console.log(`🗑️ Starting deletion process for item ${currentImageId} (${mediaType})`);
            
            // STEP 1: Clean up modal media elements (individual logging for important elements)
            const modalResults = { success: 0, failed: 0, skipped: 0 };
            const modalVideo = document.getElementById('modalPreviewVideo');
            const modalImage = document.getElementById('modalPreviewImg');
            
            if (modalVideo) cleanupMediaElement(modalVideo, 'modal-video', modalResults);
            if (modalImage) cleanupMediaElement(modalImage, 'modal-image', modalResults);
            
            if (modalResults.success > 0) {
                console.log(`🧹 Modal cleanup: ${modalResults.success} elements cleaned successfully`);
            }
            
            // STEP 2: Clean up any fullsize overlay
            const fullsizeOverlay = document.getElementById('fullsizeOverlay');
            if (fullsizeOverlay && fullsizeOverlay.style.display !== 'none') {
                const overlayResults = { success: 0, failed: 0, skipped: 0 };
                const overlayVideo = fullsizeOverlay.querySelector('video');
                const overlayImage = fullsizeOverlay.querySelector('img');
                
                if (overlayVideo) cleanupMediaElement(overlayVideo, 'overlay-video', overlayResults);
                if (overlayImage) cleanupMediaElement(overlayImage, 'overlay-image', overlayResults);
                
                fullsizeOverlay.style.display = 'none';
                
                if (overlayResults.success > 0) {
                    console.log(`🧹 Overlay cleanup: ${overlayResults.success} elements cleaned`);
                }
            }
            
            // STEP 3: Delete from server if serverPath exists
            if (currentImageData.serverPath) {
                try {
                    // Split serverPath into components: folder/date/filename
                    // Handle both forward slashes and backslashes
                    const pathComponents = currentImageData.serverPath.replace(/\\/g, '/').split('/');
                    
                    if (pathComponents.length >= 3) {
                        const folder = encodeURIComponent(pathComponents[0]);
                        const date = encodeURIComponent(pathComponents[1]);
                        const filename = encodeURIComponent(pathComponents.slice(2).join('/')); // Join remaining parts in case filename has slashes
                        
                        const response = await fetch(`/delete/${folder}/${date}/${filename}`, {
                            method: 'DELETE'
                        });
                        
                        if (response.ok) {
                            console.log('✅ File deleted from server');
                        } else if (response.status === 404) {
                            console.log('ℹ️ Server file not found (already deleted or test data)');
                        } else {
                            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                            console.warn(`⚠️ Server file deletion failed (${response.status}): ${errorData.error || 'Unknown error'}`);
                        }
                    } else {
                        console.warn('⚠️ Invalid server path format, cannot delete from server');
                    }
                } catch (serverError) {
                    console.warn('⚠️ Server delete request failed:', serverError.message);
                    // Continue with database deletion even if server deletion fails
                }
            }
            
            // STEP 4: Delete from database
            console.log(`🗄️ Attempting to delete item ${currentImageId} from database...`);
            const deleteResult = await database.deleteMedia(currentImageId);
            console.log(`✅ Database deletion completed`);
            
            // STEP 5: Close modal
            closeModal();
            
            // STEP 6: Targeted gallery cleanup with batch processing
            const gallery = document.getElementById('gallery');
            if (gallery) {
                // Count and clean videos
                const galleryVideos = gallery.querySelectorAll('video');
                const galleryBlobImages = gallery.querySelectorAll('img[src^="blob:"]');
                
                let totalCleaned = 0;
                
                if (galleryVideos.length > 0) {
                    const videoResults = performBatchCleanup(galleryVideos, 'gallery-video', 'Gallery videos');
                    totalCleaned += videoResults.success;
                }
                
                if (galleryBlobImages.length > 0) {
                    const imageResults = performBatchCleanup(galleryBlobImages, 'gallery-blob-image', 'Gallery blob images');
                    totalCleaned += imageResults.success;
                }
                
                // Clear the entire gallery HTML after targeted cleanup
                gallery.innerHTML = '';
                console.log(`🧹 Gallery cleanup completed: ${totalCleaned} media elements cleaned, DOM cleared`);
            }
            
            // STEP 7: Wait for cleanup to complete, then reload
            setTimeout(() => {
                console.log('🔄 Triggering media reload after cleanup...');
                window.dispatchEvent(new CustomEvent('mediaUpdated'));
            }, 400);
            
            showNotification(`${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} deleted successfully!`, 'success');
        } catch (error) {
            console.error('❌ Error deleting media:', error);
            showNotification('Error deleting media: ' + error.message, 'error');
        }
    }
}

// Download current item's workflow (images only)
export function downloadCurrentWorkflow() {
    const currentImageData = getCurrentImageData();
    if (!currentImageData || !currentImageData.metadata) {
        showNotification('No workflow data available for this item!', 'error');
        return;
    }
    
    if (currentImageData.mediaType === 'video') {
        showNotification('Workflow download is not available for video files.', 'error');
        return;
    }
    
    const hasWorkflow = currentImageData.metadata.workflow || currentImageData.metadata.prompt;
    if (!hasWorkflow) {
        showNotification('No ComfyUI workflow data available for this image!', 'error');
        return;
    }
    
    let workflowJson = null;
    let promptJson = null;
    
    // Extract and parse workflow data
    if (currentImageData.metadata.workflow) {
        try {
            workflowJson = JSON.parse(currentImageData.metadata.workflow);
        } catch (e) {
            console.error('Error parsing workflow:', e);
            showNotification('Error: Invalid workflow data format', 'error');
            return;
        }
    }
    
    // Extract and parse prompt data
    if (currentImageData.metadata.prompt) {
        try {
            promptJson = JSON.parse(currentImageData.metadata.prompt);
        } catch (e) {
            console.error('Error parsing prompt:', e);
            // If prompt fails to parse, it's not critical
        }
    }
    
    // Create the export data in ComfyUI's expected format
    let exportData;
    
    if (workflowJson) {
        // Export the raw workflow JSON for ComfyUI import
        exportData = workflowJson;
    } else if (promptJson) {
        // If only prompt data exists, wrap it appropriately
        exportData = {
            prompt: promptJson,
            metadata: {
                exported_from: 'AI Media Gallery',
                image_title: currentImageData.title || 'Untitled',
                export_date: new Date().toISOString()
            }
        };
    } else {
        showNotification('No valid workflow data found!', 'error');
        return;
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const filename = generateSafeFilename(currentImageData.title, 'workflow') + '.json';
    
    downloadBlob(blob, filename);
    
    showNotification(`Downloaded ComfyUI workflow for "${currentImageData.title || 'Untitled'}"! This file can be directly imported into ComfyUI.`, 'success');
}
