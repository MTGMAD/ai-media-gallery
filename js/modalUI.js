// modalUI.js - Handles the UI structure and content population of the modal

import { displayOrganizedMetadata } from './metadata.js';

// Ensure the modal has the correct two-column structure
export function ensureModalStructure() {
    const modal = document.getElementById('imageModal');
    const modalContent = modal.querySelector('.modal-content');
    
    // Check if we need to update the structure
    if (!modalContent.querySelector('.modal-left-panel')) {
        // Create new two-column structure with larger preview
        modalContent.innerHTML = `
            <span class="close" id="closeModal">&times;</span>
            
            <!-- Left Panel - Fixed with LARGER preview -->
            <div class="modal-left-panel">
                <div class="modal-media-preview">
                    <img id="modalPreviewImg" src="" alt="" style="display: none;">
                    <video id="modalPreviewVideo" controls style="display: none;">
                        <source src="" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                
                <!-- Video Controls -->
                <div class="modal-video-controls" id="modalVideoControls" style="display: none;">
                    <button class="video-control-btn" id="playPauseBtn">▶️ Play</button>
                    <button class="video-control-btn" id="loopToggleBtn">🔄 Enable Loop</button>
                    <span class="loop-indicator" id="loopIndicator">🔄 Loop: OFF</span>
                </div>
                
                <div class="modal-media-title" id="modalMediaTitle" style="display: none;">Untitled</div>
            </div>
            
            <!-- Right Panel - Scrollable with COMPRESSED metadata -->
            <div class="modal-right-panel">
                <div class="metadata-form">
                    <div class="form-group">
                        <label for="imageTitle">Title:</label>
                        <input type="text" id="imageTitle" placeholder="Enter media title">
                    </div>
                    <div class="form-group">
                        <label for="imagePrompt">AI Prompt:</label>
                        <textarea id="imagePrompt" placeholder="Enter the AI prompt used to generate this media"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="imageModel">AI Model:</label>
                        <input type="text" id="imageModel" placeholder="e.g., DALL-E 3, Midjourney, Stable Diffusion, Sora">
                    </div>
                    <div class="form-group">
                        <label for="imageTags">Tags:</label>
                        <input type="text" id="imageTags" placeholder="Enter tags separated by commas">
                    </div>
                    <div class="form-group">
                        <label for="imageNotes">Notes:</label>
                        <textarea id="imageNotes" placeholder="Additional notes about this media"></textarea>
                    </div>
                    
                    <!-- Metadata display - COMPRESSED -->
                    <div class="form-group">
                        <label>📋 Media Metadata:</label>
                        <div class="metadata-display-section">
                            
                            <!-- Prompt Section -->
                            <div id="promptSection" style="display: none;">
                                <h4 style="color: #2c3e50; margin: 0 0 6px 0; font-size: 13px; font-family: Arial, sans-serif;">
                                    🎯 Prompt Data:
                                </h4>
                                <div id="promptDisplay" style="background: #e8f4f8; padding: 6px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid #3498db;">
                                    <em>No prompt data found</em>
                                </div>
                            </div>
                            
                            <!-- Workflow Section -->
                            <div id="workflowSection" style="display: none;">
                                <h4 style="color: #2c3e50; margin: 0 0 6px 0; font-size: 13px; font-family: Arial, sans-serif;">
                                    🔧 Workflow Data:
                                </h4>
                                <div id="workflowDisplay" style="background: #fff3cd; padding: 6px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid #ffc107;">
                                    <em>No workflow data found</em>
                                </div>
                            </div>
                            
                            <!-- Other Metadata Section -->
                            <div id="otherMetadataSection" style="display: none;">
                                <h4 style="color: #2c3e50; margin: 0 0 6px 0; font-size: 13px; font-family: Arial, sans-serif;">
                                    📄 Other Metadata:
                                </h4>
                                <div id="otherMetadataDisplay" style="background: #f8f9fa; padding: 6px; border-radius: 4px; border-left: 3px solid #6c757d;">
                                    <em>No other metadata found</em>
                                </div>
                            </div>
                            
                            <!-- No metadata message -->
                            <div id="noMetadataMessage" style="text-align: center; color: #6c757d; font-style: italic;">
                                No metadata found
                            </div>
                            
                        </div>
                    </div>
                    
                    <!-- Buttons Section -->
                    <div class="modal-buttons">
                        <button class="btn" id="saveMetadata">Save Changes</button>
                        <button class="btn btn-danger" id="deleteImage">Delete Media</button>
                        <button class="btn btn-workflow" id="downloadWorkflow" style="display: none;">Download ComfyUI Workflow</button>
                    </div>
                </div>
            </div>
        `;
    }
}

export function populateModalUI(item, isVideo) {
    const modalPreviewImg = document.getElementById('modalPreviewImg');
    const modalPreviewVideo = document.getElementById('modalPreviewVideo');
    const modalMediaTitle = document.getElementById('modalMediaTitle');
    const videoControls = document.getElementById('modalVideoControls');
    const downloadWorkflow = document.getElementById('downloadWorkflow');

    // Set up media preview in left panel
    if (isVideo) {
        // Show video, hide image
        modalPreviewImg.style.display = 'none';
        modalPreviewVideo.style.display = 'block';
        videoControls.style.display = 'flex';
        
        // Use server path if available, otherwise fall back to database data
        const videoSrc = (item.serverPath && item.serverPath.trim() !== '') 
            ? `/${item.serverPath}` 
            : item.imageData;
        
        // Set video source and attributes
        modalPreviewVideo.src = videoSrc;
        modalPreviewVideo.loop = true; // Enable loop by default
        modalPreviewVideo.muted = false; // Unmuted for user interaction
    } else {
        // Show image, hide video
        modalPreviewVideo.style.display = 'none';
        videoControls.style.display = 'none';
        modalPreviewImg.style.display = 'block';
        
        // Use server path if available, otherwise fall back to database data
        const imageSrc = (item.serverPath && item.serverPath.trim() !== '') 
            ? `/${item.serverPath}` 
            : item.imageData;
        
        modalPreviewImg.src = imageSrc;
    }
    
    // Set title below media preview
    modalMediaTitle.textContent = item.title || 'Untitled';
    
    // Populate form fields in right panel
    document.getElementById('imageTitle').value = item.title || '';
    document.getElementById('imagePrompt').value = item.prompt || '';
    document.getElementById('imageModel').value = item.model || '';
    document.getElementById('imageTags').value = item.tags || '';
    document.getElementById('imageNotes').value = item.notes || '';
    
    // Check if this item has workflow data (only for images)
    const hasWorkflow = !isVideo && item.metadata && (item.metadata.workflow || item.metadata.prompt);
    if (hasWorkflow) {
        downloadWorkflow.style.display = 'inline-block';
    } else {
        downloadWorkflow.style.display = 'none';
    }
    
    // Display organized metadata
    displayOrganizedMetadata(item.metadata, isVideo);
}
