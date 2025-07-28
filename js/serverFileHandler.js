// This file contains functions related to loading and merging server-side files.
// These functions might be legacy or part of a specific migration flow.

// Load files from server API
export async function loadServerFiles() {
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
export function extractTitleFromFilename(filename) {
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
export function mergeServerAndLocalData(serverFiles, localImages) {
    const merged = [];
    const localByPath = new Map();
    
    // Index local images by normalized server path for quick lookup
    for (const local of localImages) {
        if (local.serverPath) {
            // Normalize path separators to forward slashes for comparison
            const normalizedPath = local.serverPath.replace(/\\/g, '/');
            localByPath.set(normalizedPath, local);
        }
        // Always include local images (they have metadata)
        merged.push(local);
    }
    
    // Add server files that don't have local metadata
    for (const serverFile of serverFiles) {
        // Normalize path separators to forward slashes for comparison
        const normalizedPath = serverFile.serverPath.replace(/\\/g, '/');
        if (!localByPath.has(normalizedPath)) {
            console.log(`📁 Adding server-only file: ${serverFile.title}`);
            merged.push(serverFile);
        }
    }
    
    // Sort by date (newest first)
    merged.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    
    console.log(`🔄 Merged data: ${localImages.length} local + ${serverFiles.length} server = ${merged.length} total`);
    return merged;
}
