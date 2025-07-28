// gallery.js - Handles gallery display and media card rendering

import { formatDuration, getThumbnailPositionStyle, calculateFileSize, validateDataUrl, dataUrlToBlobUrl } from './utils.js';
import { openImageModal } from './modal.js';

let allImages = [];

// Display images and videos in gallery
export function displayImages(items) {
    // Handle undefined or null items
    if (!items || !Array.isArray(items)) {
        console.warn('⚠️ displayImages called with invalid items:', items);
        items = []; // Default to empty array
    }
    
    console.log(`🎨 displayImages called with ${items.length} items`);
    allImages = items; // Store for other modules to access
    const gallery = document.getElementById('gallery');
    const noImages = document.getElementById('noImages');
    
    gallery.innerHTML = '';
    
    if (items.length === 0) {
        console.log('📭 No items to display');
        noImages.style.display = 'block';
        noImages.querySelector('p').textContent = 'No media yet. Add some images or videos by dragging and dropping them above!';
        return;
    }
    
    noImages.style.display = 'none';
    
    items.forEach((item, index) => {
        console.log(`🖼️ Rendering item ${index + 1}: ${item.title || 'Untitled'} (${item.mediaType || 'image'})`);
        
        const card = document.createElement('div');
        card.className = 'image-card';
        card.onclick = () => openImageModal(item);
        
        const date = new Date(item.dateAdded).toLocaleDateString();
        const isVideo = item.mediaType === 'video';
        
        // Get file size from base64 data or server file info
        let fileSize;
        // Prioritize metadata.fileSize if available (for both videos and images)
        if (item.metadata && item.metadata.fileSize) {
            const sizeInMB = (item.metadata.fileSize / (1024 * 1024)).toFixed(1);
            const sizeInKB = (item.metadata.fileSize / 1024).toFixed(1);
            fileSize = {
                bytes: item.metadata.fileSize,
                display: item.metadata.fileSize > 1024 * 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`,
                mb: sizeInMB,
                kb: sizeInKB
            };
        } else {
            // Fallback: For images or videos without metadata.fileSize, calculate from base64 data.
            // Prefer thumbnailData if imageData is empty (which it will be for server-uploaded images).
            const dataToCalculateFrom = item.imageData || item.thumbnailData;
            fileSize = calculateFileSize(dataToCalculateFrom);
        }
        
// Use server path if available, otherwise fall back to database data
let displayImage;
if (isVideo && item.thumbnailData) {
    // For videos, use thumbnail data if available
    console.log(`🔍 Video thumbnail data preview: ${item.thumbnailData.substring(0, 100)}...`);
    const validatedThumbnail = validateDataUrl(item.thumbnailData);
    if (validatedThumbnail === item.thumbnailData) {
        // Convert large data URLs to blob URLs for better browser compatibility
        displayImage = dataUrlToBlobUrl(validatedThumbnail);
        console.log(`📺 Using video thumbnail data (validation passed, converted to blob URL)`);
    } else {
        // Thumbnail validation failed, use placeholder
        displayImage = validatedThumbnail; // This will be the placeholder
        console.log(`⚠️ Video thumbnail validation failed, using placeholder`);
    }
} else if (!isVideo && item.serverPath && item.serverPath.trim() !== '') {
    // Use server path for images uploaded to server
    // Convert Windows backslashes to forward slashes for web URLs
    const webPath = item.serverPath.replace(/\\/g, '/');
    displayImage = `/${webPath}`;
    console.log(`🌐 Using server path: ${displayImage}`);
} else {
    // Fall back to database data for legacy items or videos without thumbnails
    const fallbackData = item.thumbnailData || item.imageData;
    displayImage = validateDataUrl(fallbackData);
    console.log(`💾 Using database data (fallback)`);
}

// Add more detailed logging to identify the exact position of corruption in base64 data
if (isVideo && item.thumbnailData) {
    const validatedThumbnail = validateDataUrl(item.thumbnailData);
    if (validatedThumbnail !== item.thumbnailData) {
        console.warn(`⚠️ Video thumbnail validation failed for item ${item.id}: ${item.title || 'Untitled'}`);
    }
}
        
        console.log(`🎯 Using display image: ${displayImage ? 'Has data' : 'NO DATA'} (length: ${displayImage ? displayImage.length : 0})`);
        
        // Create the card with conditional video controls
        card.innerHTML = `
            <div class="media-container">
                <img src="${displayImage}" alt="${item.title || 'Untitled'}" loading="lazy" style="${getThumbnailPositionStyle(item)}" 
                     data-item-id="${item.id}" data-item-title="${item.title || 'Untitled'}">
                ${isVideo ? `
                    <div class="video-overlay">
                        <button class="play-button" onclick="playVideo(${item.id}, event)" title="Play video">▶️</button>
                        <div class="video-indicator">🎬</div>
                    </div>
                ` : ''}
                <button class="thumbnail-edit-btn" onclick="openThumbnailEditor(${item.id}, event)" title="Edit thumbnail position">✂️</button>
            </div>
            <div class="image-info">
                <div class="image-title">${item.title || 'Untitled'}</div>
                <div class="image-details">
                    <div class="image-detail-line">
                        📅 ${date}
                    </div>
                    <div class="image-detail-line">
                        ${isVideo ? '🎬' : '📐'} <span class="dimensions-placeholder">Loading...</span>
                    </div>
                    <div class="image-detail-line">
                        💾 ${fileSize.display}
                    </div>
                </div>
            </div>
        `;
        
        // Add proper error handler to the image
        const img = card.querySelector('img');
        img.onerror = function() {
            const itemId = this.getAttribute('data-item-id');
            const itemTitle = this.getAttribute('data-item-title');
            console.warn(`⚠️ Image load failed for item ${itemId}: ${itemTitle}, using placeholder`);
            
            // Replace with placeholder instead of hiding
            this.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            this.style.opacity = '0.5';
            this.style.filter = 'grayscale(100%)';
            
            // Add a visual indicator that this is a placeholder
            const container = this.parentElement;
            if (container && !container.querySelector('.error-indicator')) {
                const errorIndicator = document.createElement('div');
                errorIndicator.className = 'error-indicator';
                errorIndicator.innerHTML = '⚠️';
                errorIndicator.style.cssText = `
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    background: rgba(255, 0, 0, 0.8);
                    color: white;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    z-index: 10;
                `;
                container.appendChild(errorIndicator);
            }
        };
        
        gallery.appendChild(card);
        console.log(`✅ Card ${index + 1} added to gallery`);
        
        // Calculate dimensions asynchronously
        if (isVideo && item.metadata && item.metadata.videoWidth) {
            // For videos, use stored metadata
            const dimensions = `${item.metadata.videoWidth} × ${item.metadata.videoHeight}`;
            const duration = item.metadata.duration ? ` (${formatDuration(item.metadata.duration)})` : '';
            const dimensionsSpan = card.querySelector('.dimensions-placeholder');
            if (dimensionsSpan) {
                dimensionsSpan.textContent = dimensions + duration;
            }
        } else {
            // For images or videos without metadata, calculate from image
            const dimensionsImg = new Image();
            // Capture the item data in closure to avoid reference issues
            const currentItem = { id: item.id, title: item.title || 'Untitled' };
            
            dimensionsImg.onload = function() {
                const dimensions = `${this.naturalWidth} × ${this.naturalHeight}`;
                const dimensionsSpan = card.querySelector('.dimensions-placeholder');
                if (dimensionsSpan) {
                    dimensionsSpan.textContent = dimensions;
                }
                console.log(`📐 Dimensions calculated for item ${currentItem.id}: ${dimensions}`);
            };
            dimensionsImg.onerror = function() {
                console.error(`❌ Error calculating dimensions for item ${currentItem.id} (type: ${typeof currentItem.id}): ${currentItem.title}`);
                console.error(`❌ Debug: original item.id was ${item.id} (type: ${typeof item.id})`);
                const dimensionsSpan = card.querySelector('.dimensions-placeholder');
                if (dimensionsSpan) {
                    dimensionsSpan.textContent = 'Unknown';
                }
            };
            // Use the same validated image source that was used for display
            dimensionsImg.src = displayImage;
        }
    });
    
    console.log(`🏁 Gallery rendering complete: ${items.length} cards displayed`);
}

// Play video function (called when play button is clicked)
window.playVideo = function(itemId, event) {
    event.stopPropagation(); // Prevent opening modal
    
    // Find the item and open modal in play mode
    const item = allImages.find(i => i.id === itemId);
    if (item) {
        openImageModal(item, true); // true = autoplay
    }
};

// Update stats display
export function updateStats(stats) {
    const { total, images, videos } = stats;
    
    let statsText = `${total} item${total !== 1 ? 's' : ''} stored`;
    
    if (videos > 0) {
        statsText += ` (${images} image${images !== 1 ? 's' : ''}, ${videos} video${videos !== 1 ? 's' : ''})`;
    }
    
    document.getElementById('imageCount').textContent = statsText;
}

// Get all images (for other modules to access)
export function getAllImages() {
    return allImages;
}

// Set all images (for other modules to update)
export function setAllImages(images) {
    allImages = images;
}
