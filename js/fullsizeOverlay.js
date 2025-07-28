// fullsizeOverlay.js - Handles the full-size media overlay display

// Setup click handlers for full-size media view
export function setupFullSizeHandlers(item, isVideo) {
    const modalPreviewImg = document.getElementById('modalPreviewImg');
    const modalPreviewVideo = document.getElementById('modalPreviewVideo');
    
    // Remove existing handlers
    modalPreviewImg.onclick = null;
    modalPreviewVideo.onclick = null;
    
    if (isVideo) {
        // For videos, clicking opens full-size in overlay
        modalPreviewVideo.onclick = (e) => {
            e.stopPropagation();
            const videoSrc = (item.serverPath && item.serverPath.trim() !== '') 
                ? `/${item.serverPath}` 
                : item.imageData;
            openFullSizeMedia(videoSrc, 'video');
        };
    } else {
        // For images, clicking opens full-size in overlay
        modalPreviewImg.onclick = (e) => {
            e.stopPropagation();
            const imageSrc = (item.serverPath && item.serverPath.trim() !== '') 
                ? `/${item.serverPath}` 
                : item.imageData;
            openFullSizeMedia(imageSrc, 'image');
        };
    }
}

// Open full-size media in overlay
export function openFullSizeMedia(mediaSrc, mediaType) {
    // Create or get existing overlay
    let overlay = document.getElementById('fullsizeOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fullsizeOverlay';
        overlay.className = 'fullsize-overlay';
        document.body.appendChild(overlay);
        
        // Close on click
        overlay.onclick = () => {
            overlay.style.display = 'none';
            // Stop video if it's playing
            const video = overlay.querySelector('video');
            if (video) {
                video.pause();
            }
        };
    }
    
    // Create X close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'fullsize-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        overlay.style.display = 'none';
        const video = overlay.querySelector('video');
        if (video) {
            video.pause();
        }
    };
    
    // Create media element
    let mediaElement;
    if (mediaType === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.controls = true;
        mediaElement.autoplay = true;
        mediaElement.loop = true; // Enable loop for full-size video too
        mediaElement.src = mediaSrc;
    } else {
        mediaElement = document.createElement('img');
        mediaElement.src = mediaSrc;
    }
    
    mediaElement.className = 'fullsize-media';
    
    // Prevent media click from closing overlay
    mediaElement.onclick = (e) => e.stopPropagation();
    
    // Clear previous content and add new media and close button
    overlay.innerHTML = '';
    overlay.appendChild(closeBtn);
    overlay.appendChild(mediaElement);
    
    // Show overlay
    overlay.style.display = 'flex';
}
