// databaseCleanup.js - Utility to clean up database storage and fix quota issues
// This removes redundant full image data when server paths exist

import { database } from './database.js';

/**
 * Clean up database by removing full image data for items that have server paths
 * This fixes the QuotaExceededError by reducing localStorage usage
 */
export async function cleanupDatabaseStorage() {
    console.log('🧹 Starting database cleanup to fix quota exceeded error...');
    
    try {
        // Get all media items
        const allMedia = await database.getAllMediaArray();
        console.log(`📊 Found ${allMedia.length} total items in database`);
        
        let cleanedCount = 0;
        let spaceSavedBytes = 0;
        let errorCount = 0;
        
        for (const item of allMedia) {
            try {
                // Only clean items that have server paths and full image data
                if (item.serverPath && item.serverPath.trim() !== '' && item.imageData && item.imageData.length > 1000) {
                    
                    // Calculate space that will be saved
                    const originalSize = item.imageData.length;
                    
                    // Create a small thumbnail if we don't have one
                    let thumbnailData = item.thumbnailData;
                    if (!thumbnailData || thumbnailData === item.imageData) {
                        console.log(`🖼️ Creating small thumbnail for item ${item.id}: ${item.title}`);
                        thumbnailData = await createSmallThumbnailFromData(item.imageData);
                    }
                    
                    // Update the item to remove full image data but keep small thumbnail
                    const updateData = {
                        imageData: '', // Remove full image data
                        thumbnailData: thumbnailData // Keep/update small thumbnail
                    };
                    
                    await database.updateMedia(item.id, updateData);
                    
                    cleanedCount++;
                    spaceSavedBytes += originalSize;
                    
                    console.log(`✅ Cleaned item ${item.id}: "${item.title}" (saved ${Math.round(originalSize/1024)}KB)`);
                    
                    // Process in batches to avoid overwhelming the system
                    if (cleanedCount % 5 === 0) {
                        console.log(`📈 Progress: ${cleanedCount} items cleaned, ${Math.round(spaceSavedBytes/(1024*1024))}MB saved`);
                        // Small delay to prevent blocking
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            } catch (itemError) {
                console.error(`❌ Error cleaning item ${item.id}:`, itemError);
                errorCount++;
            }
        }
        
        const spaceSavedMB = Math.round(spaceSavedBytes / (1024 * 1024));
        
        console.log(`🎉 Database cleanup completed!`);
        console.log(`📊 Results:`);
        console.log(`   ✅ ${cleanedCount} items cleaned`);
        console.log(`   💾 ${spaceSavedMB}MB of storage space freed`);
        console.log(`   ❌ ${errorCount} errors encountered`);
        
        return {
            success: true,
            cleanedCount,
            spaceSavedMB,
            errorCount,
            message: `Cleaned ${cleanedCount} items and freed ${spaceSavedMB}MB of storage space`
        };
        
    } catch (error) {
        console.error('❌ Database cleanup failed:', error);
        return {
            success: false,
            error: error.message,
            message: 'Database cleanup failed: ' + error.message
        };
    }
}

/**
 * Create a small thumbnail from base64 image data
 */
async function createSmallThumbnailFromData(imageData) {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate dimensions to fit within 200x200 while maintaining aspect ratio
                const maxSize = 200;
                let { width, height } = img;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw the image with high compression
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to JPEG with high compression (quality 0.3)
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.3);
                resolve(thumbnailDataUrl);
            };
            
            img.onerror = () => {
                console.warn('Failed to create thumbnail, keeping original');
                resolve(imageData);
            };
            
            img.src = imageData;
        } catch (error) {
            console.warn('Error creating thumbnail:', error);
            resolve(imageData);
        }
    });
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats() {
    try {
        const allMedia = await database.getAllMediaArray();
        
        let totalItems = allMedia.length;
        let itemsWithServerPath = 0;
        let itemsWithLargeData = 0;
        let totalDataSize = 0;
        let redundantDataSize = 0;
        
        for (const item of allMedia) {
            if (item.serverPath && item.serverPath.trim() !== '') {
                itemsWithServerPath++;
            }
            
            if (item.imageData && item.imageData.length > 1000) {
                const dataSize = item.imageData.length;
                totalDataSize += dataSize;
                
                // If item has server path, this data is redundant
                if (item.serverPath && item.serverPath.trim() !== '') {
                    redundantDataSize += dataSize;
                    itemsWithLargeData++;
                }
            }
        }
        
        return {
            totalItems,
            itemsWithServerPath,
            itemsWithLargeData,
            totalDataSizeMB: Math.round(totalDataSize / (1024 * 1024)),
            redundantDataSizeMB: Math.round(redundantDataSize / (1024 * 1024)),
            canCleanup: itemsWithLargeData > 0
        };
    } catch (error) {
        console.error('Error getting storage stats:', error);
        return null;
    }
}

/**
 * Check if cleanup is needed (has items with server paths and large data)
 */
export async function isCleanupNeeded() {
    const stats = await getStorageStats();
    return stats && stats.canCleanup && stats.redundantDataSizeMB > 0;
}
