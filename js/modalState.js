// modalState.js - Manages the state of the modal (current image/video data)

let currentImageId = null;
let currentImageData = null;

export function setCurrentImage(item) {
    currentImageId = item.id;
    currentImageData = item;
}

export function clearCurrentImage() {
    currentImageId = null;
    currentImageData = null;
}

// Get current image data (for other modules)
export function getCurrentImageData() {
    return currentImageData;
}

// Get current image ID (for other modules)
export function getCurrentImageId() {
    return currentImageId;
}
