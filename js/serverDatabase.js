// serverDatabase.js - Server-side SQLite database for AI Media Gallery
// Handles all database operations on the server

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);




class ServerDatabase {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '..', 'ai-gallery.db');
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        return new Promise((resolve, reject) => {
            console.log('🗄️ Initializing server-side SQLite database...');
            
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err);
                    reject(err);
                    return;
                }
                
                console.log('✅ Connected to SQLite database:', this.dbPath);
                this.createSchema()
                    .then(() => {
                        this.isInitialized = true;
                        console.log('✅ Server database initialized successfully');
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    async createSchema() {
        return new Promise((resolve, reject) => {
            const schema = `
                CREATE TABLE IF NOT EXISTS media (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    prompt TEXT,
                    model TEXT,
                    tags TEXT,
                    notes TEXT,
                    date_added TEXT NOT NULL,
                    media_type TEXT DEFAULT 'image',
                    image_data TEXT,
                    thumbnail_data TEXT,
                    thumbnail_position_x INTEGER DEFAULT 50,
                    thumbnail_position_y INTEGER DEFAULT 25,
                    metadata_json TEXT,
                    server_path TEXT,
                    file_size INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_date_added ON media(date_added DESC);
                CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);
                CREATE INDEX IF NOT EXISTS idx_title ON media(title);
                CREATE INDEX IF NOT EXISTS idx_created_at ON media(created_at DESC);

                CREATE TRIGGER IF NOT EXISTS update_timestamp 
                AFTER UPDATE ON media
                BEGIN
                    UPDATE media SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END;
            `;

            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('❌ Schema creation failed:', err);
                    reject(err);
                } else {
                    console.log('✅ Database schema created/verified');
                    resolve();
                }
            });
        });
    }

    // Convert database row to expected client format
    convertToClientFormat(row) {
        if (!row) return null;

        const item = {
            id: row.id,
            title: row.title || '',
            prompt: row.prompt || '',
            model: row.model || '',
            tags: row.tags || '',
            notes: row.notes || '',
            dateAdded: row.date_added,
            mediaType: row.media_type || 'image',
            imageData: row.image_data || '',
            thumbnailData: row.thumbnail_data || '',
            serverPath: row.server_path,
            thumbnailPosition: {
                x: row.thumbnail_position_x || 50,
                y: row.thumbnail_position_y || 25
            }
        };

        // Parse metadata if present
        if (row.metadata_json) {
            try {
                item.metadata = JSON.parse(row.metadata_json);
            } catch (e) {
                console.warn('Failed to parse metadata for item', row.id);
                item.metadata = {};
            }
        } else {
            item.metadata = {};
        }

        return item;
    }

    // Get all media items
    async getAllMedia() {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM media ORDER BY created_at DESC';
            
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('❌ Error fetching all media:', err);
                    reject(err);
                    return;
                }

                const items = rows.map(row => this.convertToClientFormat(row));
                console.log(`📊 Retrieved ${items.length} media items from database`);
                resolve(items);
            });
        });
    }

    // Add new media item
    async addMedia(mediaData) {
        if (!this.isInitialized) await this.init();

        try {
            // Validate required fields
            if (!mediaData) {
                throw new Error('Media data is required');
            }

            // Log the incoming data for debugging
            console.log('📥 addMedia called with data:', {
                title: mediaData.title,
                mediaType: mediaData.mediaType,
                serverPath: mediaData.serverPath,
                hasImageData: !!mediaData.imageData,
                imageDataLength: mediaData.imageData ? mediaData.imageData.length : 0,
                hasThumbnailData: !!mediaData.thumbnailData,
                thumbnailDataLength: mediaData.thumbnailData ? mediaData.thumbnailData.length : 0,
                hasMetadata: !!mediaData.metadata,
                metadataKeys: mediaData.metadata ? Object.keys(mediaData.metadata) : [],
                dateAdded: mediaData.dateAdded,
                hasThumbnailPosition: !!mediaData.thumbnailPosition
            });

            const query = `
                INSERT INTO media (
                    title, prompt, model, tags, notes, date_added, media_type,
                    image_data, thumbnail_data, thumbnail_position_x, thumbnail_position_y,
                    metadata_json, server_path, file_size
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // Calculate file size based on media type
            let fileSize = 0;
            if (mediaData.mediaType === 'video' && mediaData.serverPath) {
                // For videos, we'll get the file size from the actual file
                try {
                    // Normalize path separators to forward slashes
                    const normalizedPath = mediaData.serverPath.replace(/\\/g, '/');
                    const fullPath = path.join(__dirname, '..', normalizedPath);
                    if (fs.existsSync(fullPath)) {
                        const stats = fs.statSync(fullPath);
                        fileSize = stats.size;
                    }
                } catch (err) {
                    console.warn('Could not get video file size:', err.message);
                }
            } else {
                fileSize = this.calculateFileSize(mediaData.imageData);
            }
            
            // Handle potential issues with thumbnail data - validate before storing
            let thumbnailData = mediaData.thumbnailData || '';
            if (thumbnailData && typeof thumbnailData === 'string') {
                // Validate that it's a proper data URL before storing
                if (thumbnailData.startsWith('data:')) {
                    const commaIndex = thumbnailData.indexOf(',');
                    if (commaIndex === -1) {
                        console.warn('Invalid thumbnail data URL format, clearing');
                        thumbnailData = '';
                    } else {
                        const dataPart = thumbnailData.substring(commaIndex + 1);
                        if (!dataPart || dataPart.length < 100) {
                            console.warn('Thumbnail data URL appears truncated, clearing');
                            thumbnailData = '';
                        } else {
                            // For valid data URLs, allow larger sizes but still limit to prevent database issues
                            const maxThumbnailSize = 2000000; // 2MB limit for thumbnails
                            if (thumbnailData.length > maxThumbnailSize) {
                                console.warn(`Thumbnail data is very large (${thumbnailData.length} chars), clearing to prevent corruption`);
                                thumbnailData = '';
                            }
                        }
                    }
                } else {
                    console.warn('Thumbnail data is not a data URL, clearing');
                    thumbnailData = '';
                }
            }
            
            // Handle metadata JSON serialization with better error handling
            let metadataJson = null;
            if (mediaData.metadata && typeof mediaData.metadata === 'object') {
                try {
                    // Create a safe copy of metadata with size limits
                    const safeMetadata = {};
                    for (const [key, value] of Object.entries(mediaData.metadata)) {
                        try {
                            if (typeof value === 'string') {
                                // Limit individual string fields to 50KB
                                if (value.length > 50000) {
                                    safeMetadata[key] = value.substring(0, 50000) + '... (truncated)';
                                    console.warn(`📥 Truncated large metadata field: ${key} (${value.length} -> 50000 chars)`);
                                } else {
                                    safeMetadata[key] = value;
                                }
                            } else if (typeof value === 'number' || typeof value === 'boolean') {
                                safeMetadata[key] = value;
                            } else if (value === null || value === undefined) {
                                safeMetadata[key] = value;
                            } else {
                                // For objects/arrays, convert to string and limit size
                                const stringValue = String(value);
                                if (stringValue.length > 10000) {
                                    safeMetadata[key] = stringValue.substring(0, 10000) + '... (truncated)';
                                    console.warn(`📥 Truncated large metadata object field: ${key}`);
                                } else {
                                    safeMetadata[key] = stringValue;
                                }
                            }
                        } catch (fieldError) {
                            console.warn(`📥 Failed to process metadata field ${key}:`, fieldError.message);
                            safeMetadata[key] = '[Error processing field]';
                        }
                    }
                    
                    metadataJson = JSON.stringify(safeMetadata);
                    console.log('📥 Metadata JSON length:', metadataJson.length);
                    
                    // Final size check - limit total metadata to 200KB
                    if (metadataJson.length > 200000) {
                        console.warn('📥 Metadata JSON is very large, creating minimal version');
                        const minimalMetadata = {
                            originalSize: Object.keys(mediaData.metadata).length,
                            truncated: true,
                            error: 'Metadata too large for database storage'
                        };
                        metadataJson = JSON.stringify(minimalMetadata);
                    }
                } catch (jsonError) {
                    console.warn('📥 Failed to serialize metadata to JSON:', jsonError.message);
                    metadataJson = JSON.stringify({ 
                        error: 'Failed to serialize metadata',
                        originalKeys: mediaData.metadata ? Object.keys(mediaData.metadata) : []
                    });
                }
            }
            
            // Validate all parameters before database insertion
            const params = [
                String(mediaData.title || '').substring(0, 1000), // Limit title to 1000 chars
                String(mediaData.prompt || '').substring(0, 10000), // Limit prompt to 10KB
                String(mediaData.model || '').substring(0, 500), // Limit model to 500 chars
                String(mediaData.tags || '').substring(0, 2000), // Limit tags to 2KB
                String(mediaData.notes || '').substring(0, 10000), // Limit notes to 10KB
                mediaData.dateAdded || new Date().toISOString(),
                mediaData.mediaType || 'image',
                String(mediaData.imageData || ''), // Keep as is for now
                thumbnailData,
                Math.max(0, Math.min(100, mediaData.thumbnailPosition?.x || 50)), // Clamp between 0-100
                Math.max(0, Math.min(100, mediaData.thumbnailPosition?.y || 25)), // Clamp between 0-100
                metadataJson,
                mediaData.serverPath || null,
                Math.max(0, fileSize) // Ensure non-negative file size
            ];

            // Log parameter sizes for debugging
            console.log('📥 Parameter sizes:', {
                title: params[0].length,
                prompt: params[1].length,
                model: params[2].length,
                tags: params[3].length,
                notes: params[4].length,
                imageData: params[7].length,
                thumbnailData: params[8].length,
                metadataJson: params[11] ? params[11].length : 0
            });

            return new Promise((resolve, reject) => {
                this.db.run(query, params, function(err) {
                    if (err) {
                        console.error('❌ SQLite Error adding media:', err);
                        console.error('❌ Error code:', err.code);
                        console.error('❌ Error message:', err.message);
                        console.error('❌ Parameter summary:', params.map((p, i) => {
                            const type = typeof p;
                            const length = p && p.length ? p.length : 'N/A';
                            return `${i}: ${type} (${length})`;
                        }));
                        
                        // Log the actual parameter values for debugging
                        console.error('❌ Full parameter values:', params);
                        
                        // Try to get more detailed error information
                        console.error('❌ Error stack:', err.stack);
                        
                        reject(new Error(`Database error: ${err.message} (Code: ${err.code})`));
                        return;
                    }

                    console.log(`✅ Added media item with ID: ${this.lastID}`);
                    resolve(this.lastID);
                });
            });
        } catch (error) {
            console.error('❌ Error in addMedia:', error);
            throw error;
        }
    }

    // Update media item
    async updateMedia(id, updateData) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const setParts = [];
            const values = [];

            // Build dynamic update query
            for (const [key, value] of Object.entries(updateData)) {
                if (key === 'thumbnailPosition') {
                    setParts.push('thumbnail_position_x = ?', 'thumbnail_position_y = ?');
                    values.push(value.x || 50, value.y || 25);
                } else if (key === 'metadata') {
                    setParts.push('metadata_json = ?');
                    values.push(JSON.stringify(value));
                } else if (key === 'dateAdded') {
                    setParts.push('date_added = ?');
                    values.push(value);
                } else if (key === 'mediaType') {
                    setParts.push('media_type = ?');
                    values.push(value);
                } else if (key === 'imageData') {
                    setParts.push('image_data = ?');
                    values.push(value);
                    const fileSize = this.calculateFileSize(value);
                    setParts.push('file_size = ?');
                    values.push(fileSize);
                } else if (key === 'thumbnailData') {
                    setParts.push('thumbnail_data = ?');
                    values.push(value);
                } else if (key === 'serverPath') {
                    setParts.push('server_path = ?');
                    values.push(value);
                } else {
                    setParts.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (setParts.length === 0) {
                resolve(0);
                return;
            }

            values.push(id);
            const query = `UPDATE media SET ${setParts.join(', ')} WHERE id = ?`;

            this.db.run(query, values, function(err) {
                if (err) {
                    console.error('❌ Error updating media:', err);
                    reject(err);
                    return;
                }

                console.log(`✅ Updated media item ID: ${id} (${this.changes} changes)`);
                resolve(this.changes);
            });
        });
    }

    // Delete media item
    async deleteMedia(id) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const query = 'DELETE FROM media WHERE id = ?';

            this.db.run(query, [id], function(err) {
                if (err) {
                    console.error('❌ Error deleting media:', err);
                    reject(err);
                    return;
                }

                console.log(`✅ Deleted media item ID: ${id} (${this.changes} changes)`);
                resolve(this.changes);
            });
        });
    }

    // Get media by ID
    async getMediaById(id) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM media WHERE id = ?';

            this.db.get(query, [id], (err, row) => {
                if (err) {
                    console.error('❌ Error fetching media by ID:', err);
                    reject(err);
                    return;
                }

                resolve(this.convertToClientFormat(row));
            });
        });
    }

    // Search media
    async searchMedia(searchTerm) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            if (!searchTerm || searchTerm.trim() === '') {
                return this.getAllMedia().then(resolve).catch(reject);
            }

            const term = `%${searchTerm.toLowerCase()}%`;
            const query = `
                SELECT * FROM media 
                WHERE LOWER(title) LIKE ? 
                   OR LOWER(prompt) LIKE ? 
                   OR LOWER(tags) LIKE ? 
                   OR LOWER(model) LIKE ?
                   OR LOWER(notes) LIKE ?
                ORDER BY created_at DESC
            `;

            this.db.all(query, [term, term, term, term, term], (err, rows) => {
                if (err) {
                    console.error('❌ Error searching media:', err);
                    reject(err);
                    return;
                }

                const items = rows.map(row => this.convertToClientFormat(row));
                console.log(`🔍 Search for "${searchTerm}" returned ${items.length} results`);
                resolve(items);
            });
        });
    }

    // Get statistics
    async getStats() {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END) as images,
                    SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END) as videos,
                    SUM(file_size) as total_size
                FROM media
            `;

            this.db.get(query, [], (err, row) => {
                if (err) {
                    console.error('❌ Error getting stats:', err);
                    reject(err);
                    return;
                }

                const stats = {
                    total: row.total || 0,
                    images: row.images || 0,
                    videos: row.videos || 0,
                    totalSizeMB: Math.round((row.total_size || 0) / (1024 * 1024))
                };

                console.log('📊 Database stats:', stats);
                resolve(stats);
            });
        });
    }

    // Import data from client export (for migration)
    async importData(exportData) {
        if (!this.isInitialized) await this.init();

        try {
            if (!exportData || !exportData.images || !Array.isArray(exportData.images)) {
                throw new Error('Invalid export data format');
            }

            console.log(`📥 Starting import of ${exportData.images.length} items...`);

            let imported = 0;
            let errors = 0;

            // Process items sequentially to avoid database conflicts
            for (let index = 0; index < exportData.images.length; index++) {
                try {
                    const item = { ...exportData.images[index] }; // Create a copy
                    
                    // Remove ID to let database auto-assign
                    delete item.id;

                    await this.addMedia(item);
                    imported++;
                    
                    if (imported % 10 === 0) {
                        console.log(`📥 Import progress: ${imported}/${exportData.images.length}`);
                    }
                } catch (err) {
                    console.warn(`⚠️ Failed to import item ${index}:`, err);
                    errors++;
                }
            }

            console.log(`✅ Import completed: ${imported} items imported, ${errors} errors`);
            return { imported, errors };

        } catch (error) {
            console.error('❌ Import failed:', error);
            throw error;
        }
    }

    // Calculate file size from base64 data
    calculateFileSize(base64Data) {
        try {
            if (!base64Data || typeof base64Data !== 'string') return 0;
            const parts = base64Data.split(',');
            const data = parts.length > 1 ? parts[1] : base64Data;
            return Math.round((data.length * 3) / 4);
        } catch (error) {
            console.warn('Error calculating file size:', error);
            return 0;
        }
    }

    // Close database connection
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err);
                    } else {
                        console.log('✅ Database connection closed');
                    }
                    this.isInitialized = false;
                    resolve();
                });
            });
        }
    }
}

// Create singleton instance
const serverDB = new ServerDatabase();

export default serverDB;
