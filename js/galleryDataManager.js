import { database } from './clientDatabase.js';
import { displayImages, updateStats, setAllImages } from './gallery.js';
import { showNotification } from './utils.js';

// Load all images and display them
export async function loadImages() {
    try {
        // Load ONLY from server database (no filesystem merging needed)
        const allImages = await database.loadAllMedia();
        
        // Ensure we always have a valid array
        const validImages = Array.isArray(allImages) ? allImages : [];
        
        setAllImages(validImages);
        displayImages(validImages);
        
        console.log(`📊 Loaded ${validImages.length} media items from server database`);
    } catch (error) {
        console.error('Error loading images:', error);
        showNotification('Error loading media: ' + error.message, 'error');
        
        // Display empty gallery on error
        setAllImages([]);
        displayImages([]);
    }
}

// Update stats display
export async function updateStatsDisplay() {
    try {
        const stats = await database.getStats();
        updateStats(stats);
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Handle search with debouncing
export async function handleSearch(e) {
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
