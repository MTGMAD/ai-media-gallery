// script.js - Main application entry point (v3.0 - SQLite)

// Import all modules (keeping existing structure)
import { database } from './database.js';  // ← Fixed import path
import { handleFileSelect, handleFileDrop } from './mediaProcessor.js';
import { displayImages, updateStats, setAllImages } from './gallery.js';
import { setupModalEventListeners } from './modal.js';
import { setupThumbnailPositionPicker } from './thumbnailEditor.js';
import { addThumbnailGenerationControls } from './thumbnailGenerator.js';
import { debounce, showNotification, downloadBlob, generateSafeFilename } from './utils.js';
import { cleanupDatabaseStorage, isCleanupNeeded, getStorageStats } from './databaseCleanup.js';
import { generateIntegrityReport, cleanupOrphanFiles } from './orphanFileManager.js';

// Initialize the app
async function init() {
    console.log('🚀 Initializing AI Media Gallery v3.0');
    
    try {
        // Check if database cleanup is needed (fixes quota exceeded errors)
        await checkAndOfferCleanup();
        
        await loadImages();
        await updateStatsDisplay();
        setupEventListeners();
        setupModalEventListeners();
        setupThumbnailPositionPicker();
        addThumbnailGenerationControls();
        
        console.log('✅ App initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing app:', error);
        showNotification('Error initializing app: ' + error.message, 'error');
    }
}

// Load all images and display them
async function loadImages() {
    try {
        // Load from both local database and server files for cross-browser compatibility
        const [localImages, serverFiles] = await Promise.all([
            database.loadAllMedia().catch(() => []),
            loadServerFiles().catch(() => [])
        ]);
        
        // Merge server files with local metadata
        const mergedImages = mergeServerAndLocalData(serverFiles, localImages);
        
        // Ensure we always have a valid array
        const validImages = Array.isArray(mergedImages) ? mergedImages : [];
        
        setAllImages(validImages);
        displayImages(validImages);
        
        console.log(`📊 Loaded ${validImages.length} media items (${localImages.length} local + ${serverFiles.length} server)`);
    } catch (error) {
        console.error('Error loading images:', error);
        showNotification('Error loading media: ' + error.message, 'error');
        
        // Display empty gallery on error
        setAllImages([]);
        displayImages([]);
    }
}

// Update stats display
async function updateStatsDisplay() {
    try {
        const stats = await database.getStats();
        updateStats(stats);
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Setup main event listeners
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const searchBox = document.getElementById('searchBox');
    const exportData = document.getElementById('exportData');
    const importData = document.getElementById('importData');
    const importFile = document.getElementById('importFile');
    const orphanCleanup = document.getElementById('orphanCleanup');

    // Upload area click
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target, database, async () => {
            await loadImages();
            await updateStatsDisplay();
        });
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        uploadArea.classList.remove('dragover');
        handleFileDrop(e, database, async () => {
            await loadImages();
            await updateStatsDisplay();
        });
    });

    // Search functionality with debounce
    const debouncedSearch = debounce(handleSearch, 300);
    searchBox.addEventListener('input', debouncedSearch);

    // Export/Import buttons
    exportData.addEventListener('click', exportAllData);
    importData.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importAllData);
    orphanCleanup.addEventListener('click', handleOrphanCleanup);
    
    // Listen for media updates from other modules
    window.addEventListener('mediaUpdated', async () => {
        await loadImages();
        await updateStatsDisplay();
    });
}

// Handle search with debouncing
async function handleSearch(e) {
    try {
        const searchTerm = e.target.value;
        const results = await database.searchMedia(searchTerm);
        
        // Ensure we always have a valid array
        const validResults = Array.isArray(results) ? results : [];
        
        setAllImages(validResults);
        displayImages(validResults);
    } catch (error) {
        console.error('Error searching:', error);
        showNotification('Error searching media: ' + error.message, 'error');
        
        // Display empty results on error
        setAllImages([]);
        displayImages([]);
    }
}

// Export all data to JSON file
async function exportAllData() {
    try {
        const exportData = await database.exportAllData();
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const filename = generateSafeFilename('ai-media-gallery-backup', '') + '.json';
        
        downloadBlob(blob, filename);
        
        const { images: imageCount = 0, videos: videoCount = 0 } = await database.getStats();
        showNotification(`Exported ${exportData.totalItems} items to backup file!\n(${imageCount} images, ${videoCount} videos)`, 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Error exporting data: ' + error.message, 'error');
    }
}

// Import data from JSON file
async function importAllData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (importData.images && Array.isArray(importData.images)) {
            const results = await database.addMultipleMedia(importData.images);
            
            await loadImages();
            await updateStatsDisplay();
            
            showNotification(`Imported ${importData.images.length} items successfully!`, 'success');
        } else {
            showNotification('Invalid backup file format!', 'error');
        }
    } catch (error) {
        console.error('Error importing file:', error);
        showNotification('Error importing file: ' + error.message, 'error');
    }
    
    // Reset file input
    e.target.value = '';
}

// Handle orphan file cleanup
async function handleOrphanCleanup() {
    try {
        showNotification('🔍 Scanning for orphan files...', 'info');
        
        const report = await generateIntegrityReport(database);
        
        if (report.orphanCount === 0) {
            showNotification('✅ No orphan files found! Your file system is clean.', 'success');
            return;
        }
        
        const message = `🗑️ Orphan File Cleanup Report\n\n` +
            `Found ${report.orphanCount} orphan files on server without database records.\n` +
            `These files are taking up space and should be cleaned up.\n\n` +
            `📊 System Status:\n` +
            `• Server Files: ${report.serverFiles}\n` +
            `• Database Records: ${report.databaseRecords}\n` +
            `• Orphan Files: ${report.orphanCount}\n` +
            `• Missing Files: ${report.missingCount}\n` +
            `• Integrity Score: ${report.integrityScore}%\n\n` +
            `Would you like to delete these orphan files?`;
        
        if (confirm(message)) {
            showNotification('🧹 Cleaning up orphan files...', 'info');
            
            const cleanupResult = await cleanupOrphanFiles(report.orphanFiles);
            
            if (cleanupResult.success.length > 0) {
                showNotification(
                    `✅ Orphan cleanup completed!\n\n` +
                    `• ${cleanupResult.success.length} files deleted\n` +
                    `• ${cleanupResult.failed.length} files failed\n` +
                    `• File system integrity improved`, 
                    'success'
                );
            } else {
                showNotification(
                    `❌ Orphan cleanup failed!\n\n` +
                    `No files were successfully deleted.\n` +
                    `Check console for error details.`, 
                    'error'
                );
            }
        } else {
            showNotification('Orphan cleanup cancelled.', 'info');
        }
        
    } catch (error) {
        console.error('Error during orphan cleanup:', error);
        showNotification('Error during orphan cleanup: ' + error.message, 'error');
    }
}

// Check if database cleanup is needed and offer to fix quota issues
async function checkAndOfferCleanup() {
    try {
        const needsCleanup = await isCleanupNeeded();
        if (needsCleanup) {
            const stats = await getStorageStats();
            console.log('🚨 Database cleanup needed:', stats);
            
            const message = `⚠️ Storage Optimization Available\n\n` +
                `Your database contains ${stats.redundantDataSizeMB}MB of redundant data that can be safely removed.\n\n` +
                `This will fix "QuotaExceededError" issues and improve performance.\n\n` +
                `Would you like to optimize your storage now?`;
            
            if (confirm(message)) {
                console.log('🧹 User approved cleanup, starting...');
                showNotification('Optimizing storage, please wait...', 'info');
                
                const result = await cleanupDatabaseStorage();
                
                if (result.success) {
                    showNotification(
                        `✅ Storage optimized successfully!\n\n` +
                        `• ${result.cleanedCount} items cleaned\n` +
                        `• ${result.spaceSavedMB}MB freed\n` +
                        `• Quota errors should be resolved`, 
                        'success'
                    );
                } else {
                    showNotification('❌ Storage optimization failed: ' + result.message, 'error');
                }
            } else {
                console.log('ℹ️ User declined cleanup');
                showNotification('Storage optimization skipped. You can run it later if needed.', 'info');
            }
        }
    } catch (error) {
        console.warn('Error checking cleanup status:', error);
        // Don't block app initialization if cleanup check fails
    }
}


// Load files from server API
async function loadServerFiles() {
    try {
        const response = await fetch('/api/images');
        if (!response.ok) {
            throw new Error(`Server API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success || !data.mediaByDate) {
            return [];
        }
        
        const serverFiles = [];
        let idCounter = 1000000; // Use high IDs to avoid conflicts with local data
        
        // Convert server file structure to our format
        for (const [date, files] of Object.entries(data.mediaByDate)) {
            for (const file of files) {
                const serverItem = {
                    id: idCounter++,
                    title: extractTitleFromFilename(file.filename),
                    prompt: '',
                    model: '',
                    tags: '',
                    notes: '',
                    dateAdded: file.modified || new Date().toISOString(),
                    mediaType: file.mediaType || 'image',
                    imageData: '', // No base64 data for server files
                    thumbnailData: '', // Will use server path
                    serverPath: file.path.replace(/^\//, ''), // Remove leading slash
                    thumbnailPosition: { x: 50, y: 25 },
                    metadata: {},
                    isServerFile: true // Flag to identify server-only files
                };
                
                serverFiles.push(serverItem);
            }
        }
        
        console.log(`🌐 Loaded ${serverFiles.length} files from server`);
        return serverFiles;
        
    } catch (error) {
        console.warn('Failed to load server files:', error);
        return [];
    }
}

// Extract a readable title from filename
function extractTitleFromFilename(filename) {
    // Remove timestamp prefix and file extension
    let title = filename.replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
    
    // Replace underscores with spaces and clean up
    title = title.replace(/_/g, ' ').trim();
    
    // Capitalize first letter
    if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
    return title || 'Untitled';
}

// Merge server files with local database records
function mergeServerAndLocalData(serverFiles, localImages) {
    const merged = [];
    const localByPath = new Map();
    
    // Index local images by server path for quick lookup
    for (const local of localImages) {
        if (local.serverPath) {
            localByPath.set(local.serverPath, local);
        }
        // Always include local images (they have metadata)
        merged.push(local);
    }
    
    // Add server files that don't have local metadata
    for (const serverFile of serverFiles) {
        if (!localByPath.has(serverFile.serverPath)) {
            console.log(`📁 Adding server-only file: ${serverFile.title}`);
            merged.push(serverFile);
        }
    }
    
    // Sort by date (newest first)
    merged.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    
    console.log(`🔄 Merged data: ${localImages.length} local + ${serverFiles.length} server = ${merged.length} total`);
    return merged;
}

// Start the app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
