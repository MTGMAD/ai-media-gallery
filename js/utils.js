// utils.js - Utility functions used across the application

// Format duration from seconds to MM:SS
export function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Get thumbnail position CSS style
export function getThumbnailPositionStyle(item) {
    if (item.thumbnailPosition) {
        return `object-position: ${item.thumbnailPosition.x}% ${item.thumbnailPosition.y}%;`;
    }
    return 'object-position: 50% 25%;'; // TOP-ALIGNED default: 25% from top instead of center
}

// Generate safe filename for downloads
export function generateSafeFilename(title, suffix = '') {
    const safeTitle = (title || 'Untitled').replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    return `${safeTitle}${suffix ? '_' + suffix : ''}_${timestamp}`;
}

// Calculate file size from base64 data
export function calculateFileSize(base64Data) {
    // Handle undefined, null, or empty data
    if (!base64Data || typeof base64Data !== 'string') {
        return {
            bytes: 0,
            display: 'Unknown',
            mb: '0.0',
            kb: '0.0'
        };
    }
    
    try {
        const data = base64Data.split(',')[1];
        if (!data) {
            // If no comma found or no data after comma
            return {
                bytes: 0,
                display: 'Unknown',
                mb: '0.0',
                kb: '0.0'
            };
        }
        
        const fileSizeBytes = Math.round((data.length * 3) / 4);
        const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(1);
        const fileSizeKB = (fileSizeBytes / 1024).toFixed(1);
        return {
            bytes: fileSizeBytes,
            display: fileSizeBytes > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`,
            mb: fileSizeMB,
            kb: fileSizeKB
        };
    } catch (error) {
        console.warn('Error calculating file size:', error);
        return {
            bytes: 0,
            display: 'Unknown',
            mb: '0.0',
            kb: '0.0'
        };
    }
}

// Clean up text content for display
export function cleanPromptText(text) {
    if (!text) return '';
    
    // Remove common prefixes/suffixes that might be added by processing
    let cleaned = text.replace(/^(aidma-niji, niji, anime style, sharp image\s*)/i, '');
    cleaned = cleaned.replace(/\n+/g, ' '); // Replace newlines with spaces
    cleaned = cleaned.trim();
    
    return cleaned;
}

// Clean model names for display
export function cleanModelName(modelName) {
    if (!modelName) return '';
    
    // Remove file extensions
    let cleaned = modelName.replace(/\.(safetensors|ckpt|pt)$/i, '');
    
    // Remove common prefixes/paths
    cleaned = cleaned.replace(/^.*[\/\\]/, ''); // Remove path
    cleaned = cleaned.replace(/^SDXL[\/\\]?/i, ''); // Remove SDXL prefix
    
    // Clean up underscores and make more readable
    cleaned = cleaned.replace(/_/g, ' ');
    
    return cleaned.trim();
}

// Debounce function for search input
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Download blob as file
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Show user notification
export function showNotification(message, type = 'info') {
    // Remove any existing notification boxes
    const existingNotification = document.querySelector('.notification-box');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-box ${type}`;
    
    // Add icon based on type
    let icon = '💡';
    if (type === 'error') icon = '❌';
    else if (type === 'success') icon = '✅';
    
    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-message">${message}</div>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Trigger reflow and show notification
    notification.offsetHeight; // Force reflow
    notification.classList.add('show');
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        // Remove completely after transition
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Validate file type
export function isValidMediaFile(file) {
    return file.type.startsWith('image/') || file.type.startsWith('video/');
}

// Get media type from file
export function getMediaType(file) {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('image/')) return 'image';
    return 'unknown';
}

// Validate and fix data URLs
export function validateDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
        console.warn('⚠️ Invalid data URL: not a string or empty');
        return createPlaceholderDataUrl();
    }
    
    // Check if it's a valid data URL format
    if (!dataUrl.startsWith('data:')) {
        console.warn('⚠️ Invalid data URL: does not start with "data:"');
        return createPlaceholderDataUrl();
    }
    
    // Check for proper data URL structure
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
        console.warn('⚠️ Invalid data URL: missing comma separator');
        return createPlaceholderDataUrl();
    }
    
    // Check if the data part exists and is not empty
    const dataPart = dataUrl.substring(commaIndex + 1);
    if (!dataPart || dataPart.length === 0) {
        console.warn('⚠️ Invalid data URL: empty data part');
        return createPlaceholderDataUrl();
    }
    
// Additional validation for base64 data
try {
    // For large data URLs (like video thumbnails), do a comprehensive validation
    if (dataPart.length > 50000) {
        console.log(`🔍 Validating large data URL (${dataPart.length} chars)...`);

        // Test the entire base64 string in chunks to catch any corruption
        const chunkSize = 10000;
        for (let i = 0; i < dataPart.length; i += chunkSize) {
                const chunk = dataPart.substring(i, Math.min(i + chunkSize, dataPart.length));
                try {
                    atob(chunk);
                } catch (chunkError) {
                    console.warn(`⚠️ Invalid data URL: corrupted base64 data detected at position ${i}-${i + chunk.length}. Problematic chunk: "${chunk.substring(0, 50)}..."`);
                    return createPlaceholderDataUrl();
                }
            }
            
            // Additional check: try to decode the beginning to check for valid image headers
            try {
                const headerDecoded = atob(dataPart.substring(0, Math.min(5000, dataPart.length)));
                // Check if it looks like valid image data (has image headers)
                if (!headerDecoded.includes('JFIF') && !headerDecoded.includes('PNG') && !headerDecoded.includes('GIF')) {
                    console.warn('⚠️ Invalid data URL: does not appear to contain valid image data');
                    return createPlaceholderDataUrl();
                }
            } catch (e) {
                console.warn('⚠️ Invalid data URL: failed header validation');
                return createPlaceholderDataUrl();
            }
            
            console.log('✅ Large data URL validation passed');
        } else {
            // For smaller data URLs, just test the whole thing
            atob(dataPart);
        }
    } catch (error) {
        console.warn('⚠️ Invalid data URL: corrupted base64 data');
        return createPlaceholderDataUrl();
    }

// Add more detailed logging to identify the exact position of corruption
if (dataPart.length > 50000) {
    const chunkSize = 10000;
    for (let i = 0; i < dataPart.length; i += chunkSize) {
        const chunk = dataPart.substring(i, Math.min(i + chunkSize, dataPart.length));
        try {
            atob(chunk);
        } catch (chunkError) {
            console.warn(`⚠️ Invalid data URL: corrupted base64 data detected at position ${i}-${i + chunk.length}`);
            return createPlaceholderDataUrl();
        }
    }
}
    
    // Check for valid image MIME types
    const mimeMatch = dataUrl.match(/^data:([^;]+)/);
    if (mimeMatch) {
        const mimeType = mimeMatch[1];
        const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validMimeTypes.includes(mimeType)) {
            console.warn(`⚠️ Invalid data URL: unsupported MIME type ${mimeType}`);
            return createPlaceholderDataUrl();
        }
    }
    
    return dataUrl;
}

// Create a placeholder data URL for broken images
function createPlaceholderDataUrl() {
    // Create a simple 1x1 transparent GIF as placeholder
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}

// Convert data URL to blob URL for large images (more efficient)
export function dataUrlToBlobUrl(dataUrl) {
    try {
        // For small data URLs, return as-is
        if (dataUrl.length < 50000) {
            return dataUrl;
        }
        
        // For large data URLs, convert to blob URL
        const [header, data] = dataUrl.split(',');
        if (!header || !data) {
            console.warn('⚠️ Invalid data URL format for blob conversion');
            return createPlaceholderDataUrl();
        }
        
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        
        // Test if the base64 data is valid before trying to decode it all
        try {
            // Test decode a small portion first
            atob(data.substring(0, Math.min(100, data.length)));
        } catch (testError) {
            console.warn('⚠️ Corrupted base64 data detected, using placeholder');
            return createPlaceholderDataUrl();
        }
        
        const byteCharacters = atob(data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        
        const blobUrl = URL.createObjectURL(blob);
        console.log(`🔄 Converted large data URL (${dataUrl.length} chars) to blob URL`);
        return blobUrl;
    } catch (error) {
        console.warn('⚠️ Failed to convert data URL to blob URL, using placeholder:', error.message);
        return createPlaceholderDataUrl();
    }
}

// Show custom confirmation dialog
export function showConfirmDialog(message) {
    return new Promise((resolve) => {
        // Remove any existing confirm dialogs
        const existingDialog = document.querySelector('.confirm-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }
        
        // Create dialog elements
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        
        dialog.innerHTML = `
            <div class="confirm-dialog-content">
                <div class="confirm-dialog-message">${message}</div>
                <div class="confirm-dialog-buttons">
                    <button class="confirm-dialog-btn confirm-dialog-btn-confirm">Delete</button>
                    <button class="confirm-dialog-btn confirm-dialog-btn-cancel">Cancel</button>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(dialog);
        
        // Get button elements
        const confirmBtn = dialog.querySelector('.confirm-dialog-btn-confirm');
        const cancelBtn = dialog.querySelector('.confirm-dialog-btn-cancel');
        
        // Handle confirm
        confirmBtn.addEventListener('click', () => {
            dialog.classList.remove('show');
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.parentNode.removeChild(dialog);
                }
                resolve(true);
            }, 300);
        });
        
        // Handle cancel
        cancelBtn.addEventListener('click', () => {
            dialog.classList.remove('show');
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.parentNode.removeChild(dialog);
                }
                resolve(false);
            }, 300);
        });
        
        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                dialog.classList.remove('show');
                setTimeout(() => {
                    if (dialog.parentNode) {
                        dialog.parentNode.removeChild(dialog);
                    }
                    resolve(false);
                }, 300);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Show dialog with slight delay to trigger transition
        setTimeout(() => {
            dialog.classList.add('show');
        }, 10);
    });
}
