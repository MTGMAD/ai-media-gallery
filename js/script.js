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
        const allImages = await database.loadAllMedia();
        setAllImages(allImages);
        displayImages(allImages);
    } catch (error) {
        console.error('Error loading images:', error);
        showNotification('Error loading media: ' + error.message, 'error');
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
        setAllImages(results);
        displayImages(results);
    } catch (error) {
        console.error('Error searching:', error);
        showNotification('Error searching media: ' + error.message, 'error');
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

// Start the app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
