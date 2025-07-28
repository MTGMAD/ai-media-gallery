// script.js - Main application entry point (v3.0 - SQLite)

// Import all modules (keeping existing structure)
import { database } from './clientDatabase.js';  // ← Updated to use server-side database
import { handleFileSelect, handleFileDrop } from './mediaProcessor.js';
import { displayImages, setAllImages } from './gallery.js';
import { loadImages, updateStatsDisplay, handleSearch } from './galleryDataManager.js';
import { setupThumbnailPositionPicker } from './thumbnailEditor.js';
import { setupModalEventListeners } from './modalEvents.js';
import { addThumbnailGenerationControls } from './thumbnailGenerator.js';
import { debounce, showNotification } from './utils.js';
import { exportAllData, importAllData } from './backupManager.js';
import { handleOrphanCleanup, checkAndOfferCleanup } from './maintenanceManager.js';

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





// Start the app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
