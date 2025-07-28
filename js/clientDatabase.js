// clientDatabase.js - Client-side database API that communicates with server
// Replaces the localStorage-based database with server API calls

class ClientDatabase {
    constructor() {
        this.baseUrl = window.location.origin;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Test server connection
            const response = await fetch(`${this.baseUrl}/api/stats`);
            if (!response.ok) {
                throw new Error('Server connection failed');
            }
            
            console.log('✅ Client database connected to server API');
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Failed to connect to server database:', error);
            throw error;
        }
    }

    // API wrapper methods that match the original database interface

    getInstance() {
        return {
            images: {
                add: (data) => this.addMedia(data),
                update: (id, data) => this.updateMedia(id, data),
                delete: (id) => this.deleteMedia(id),
                get: (id) => this.getMediaById(id),
                toArray: () => this.loadAllMedia(),
                orderBy: () => ({ reverse: () => ({ toArray: () => this.loadAllMedia() }) })
            }
        };
    }

    async loadAllMedia() {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/media`);
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to load media');
            }
            
            console.log(`📊 Loaded ${result.media.length} media items from server`);
            return result.media;
        } catch (error) {
            console.error('❌ Error loading media from server:', error);
            throw error;
        }
    }

    async addMedia(mediaData) {
        if (!this.isInitialized) await this.init();
        
        try {
            console.log('📤 Sending media data to server:', {
                title: mediaData.title,
                mediaType: mediaData.mediaType,
                hasMetadata: !!mediaData.metadata,
                metadataKeys: mediaData.metadata ? Object.keys(mediaData.metadata) : [],
                serverPath: mediaData.serverPath
            });
            
            const response = await fetch(`${this.baseUrl}/api/media`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(mediaData)
            });
            
            console.log('📤 Server response status:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Server response error text:', errorText);
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to add media');
            }
            
            console.log(`✅ Added media item with server ID: ${result.id}`);
            return result.id;
        } catch (error) {
            console.error('❌ Error adding media to server:', error);
            console.error('❌ Error stack:', error.stack);
            throw error;
        }
    }

    async updateMedia(id, updateData) {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/media/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update media');
            }
            
            console.log(`✅ Updated media item ID: ${id} (${result.changes} changes)`);
            return result.changes;
        } catch (error) {
            console.error('❌ Error updating media on server:', error);
            throw error;
        }
    }

    async deleteMedia(id) {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/media/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete media');
            }
            
            console.log(`✅ Deleted media item ID: ${id} (${result.changes} changes)`);
            return result.changes;
        } catch (error) {
            console.error('❌ Error deleting media from server:', error);
            throw error;
        }
    }

    async getMediaById(id) {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/media/${id}`);
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to get media');
            }
            
            return result.media;
        } catch (error) {
            console.error('❌ Error getting media by ID from server:', error);
            throw error;
        }
    }

    async getAllMediaArray() {
        return await this.loadAllMedia();
    }

    async addMultipleMedia(mediaArray) {
        if (!this.isInitialized) await this.init();
        
        const results = [];
        
        // Add items one by one to avoid overwhelming the server
        for (const item of mediaArray) {
            try {
                delete item.id; // Let server assign new ID
                const id = await this.addMedia(item);
                results.push({ id, item });
            } catch (error) {
                console.error('Error adding item during bulk import:', error);
                results.push({ error: error.message, item });
            }
        }
        
        return results;
    }

    async searchMedia(searchTerm) {
        if (!this.isInitialized) await this.init();
        
        try {
            if (!searchTerm || searchTerm.trim() === '') {
                return await this.loadAllMedia();
            }
            
            const encodedTerm = encodeURIComponent(searchTerm);
            const response = await fetch(`${this.baseUrl}/api/media/search/${encodedTerm}`);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to search media');
            }
            
            console.log(`🔍 Search for "${searchTerm}" returned ${result.media.length} results`);
            return result.media;
        } catch (error) {
            console.error('❌ Error searching media on server:', error);
            throw error;
        }
    }

    async getStats() {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/stats`);
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to get stats');
            }
            
            return result.stats;
        } catch (error) {
            console.error('❌ Error getting stats from server:', error);
            throw error;
        }
    }

    async exportAllData() {
        if (!this.isInitialized) await this.init();
        
        try {
            const response = await fetch(`${this.baseUrl}/api/export`);
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const exportData = await response.json();
            return exportData;
        } catch (error) {
            console.error('❌ Error exporting data from server:', error);
            throw error;
        }
    }

    // Migration helper - import data from client export
    async migrateFromClientExport(exportData) {
        if (!this.isInitialized) await this.init();
        
        try {
            console.log(`📥 Starting migration of ${exportData.images?.length || 0} items to server...`);
            
            const response = await fetch(`${this.baseUrl}/api/migrate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(exportData)
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Migration failed');
            }
            
            console.log(`✅ Migration completed: ${result.imported} items imported, ${result.errors} errors`);
            return result;
        } catch (error) {
            console.error('❌ Error during migration:', error);
            throw error;
        }
    }

    async close() {
        // No cleanup needed for API-based database
        this.isInitialized = false;
        console.log('✅ Client database connection closed');
    }
}

// Create singleton instance
const clientDB = new ClientDatabase();

// Export database API that matches existing interface
export const database = {
    getInstance() {
        return clientDB.getInstance();
    },

    async loadAllMedia() {
        return await clientDB.loadAllMedia();
    },

    async addMedia(mediaData) {
        return await clientDB.addMedia(mediaData);
    },

    async updateMedia(id, updateData) {
        return await clientDB.updateMedia(id, updateData);
    },

    async deleteMedia(id) {
        return await clientDB.deleteMedia(id);
    },

    async getMediaById(id) {
        return await clientDB.getMediaById(id);
    },

    async getAllMediaArray() {
        return await clientDB.getAllMediaArray();
    },

    async addMultipleMedia(mediaArray) {
        return await clientDB.addMultipleMedia(mediaArray);
    },

    async searchMedia(searchTerm) {
        return await clientDB.searchMedia(searchTerm);
    },

    async getStats() {
        return await clientDB.getStats();
    },

    async exportAllData() {
        return await clientDB.exportAllData();
    },

    async migrateFromClientExport(exportData) {
        return await clientDB.migrateFromClientExport(exportData);
    },

    async close() {
        return await clientDB.close();
    }
};

export default clientDB;
