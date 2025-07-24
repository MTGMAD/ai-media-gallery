// orphanFileManager.js - Utility to detect and clean up orphan files

/**
 * Scan for orphan files (files on server without database records)
 */
export async function scanForOrphanFiles(database) {
    console.log('🔍 Scanning for orphan files...');
    
    try {
        // Get all files from server
        const serverResponse = await fetch('/api/images');
        if (!serverResponse.ok) {
            throw new Error('Failed to fetch server files');
        }
        
        const serverData = await serverResponse.json();
        const allServerFiles = [];
        
        // Flatten all server files into a single array
        for (const date in serverData.mediaByDate) {
            serverData.mediaByDate[date].forEach(file => {
                allServerFiles.push({
                    path: file.path,
                    filename: file.filename,
                    size: file.size,
                    modified: file.modified,
                    mediaType: file.mediaType
                });
            });
        }
        
        console.log(`📊 Found ${allServerFiles.length} files on server`);
        
        // Get all database records
        const dbRecords = await database.loadAllMedia();
        console.log(`📊 Found ${dbRecords.length} records in database`);
        
        // Create a set of server paths that have database records
        const dbServerPaths = new Set();
        dbRecords.forEach(record => {
            if (record.serverPath) {
                // Convert to web path format for comparison
                const webPath = '/' + record.serverPath.replace(/\\/g, '/');
                dbServerPaths.add(webPath);
            }
        });
        
        // Find orphan files (server files without database records)
        const orphanFiles = allServerFiles.filter(file => !dbServerPaths.has(file.path));
        
        console.log(`🗑️ Found ${orphanFiles.length} orphan files`);
        
        return {
            totalServerFiles: allServerFiles.length,
            totalDbRecords: dbRecords.length,
            orphanFiles: orphanFiles,
            orphanCount: orphanFiles.length
        };
        
    } catch (error) {
        console.error('❌ Error scanning for orphan files:', error);
        throw error;
    }
}

/**
 * Delete orphan files from server
 */
export async function cleanupOrphanFiles(orphanFiles) {
    console.log(`🧹 Starting cleanup of ${orphanFiles.length} orphan files...`);
    
    const results = {
        success: [],
        failed: [],
        totalAttempted: orphanFiles.length
    };
    
    for (const file of orphanFiles) {
        try {
            // Parse the path to get folder, date, and filename
            // Expected format: "/images/2025-07-23/filename.png"
            const pathParts = file.path.substring(1).split('/'); // Remove leading slash
            
            if (pathParts.length !== 3) {
                console.warn(`⚠️ Skipping file with invalid path format: ${file.path}`);
                results.failed.push({
                    file: file,
                    error: 'Invalid path format'
                });
                continue;
            }
            
            const [folder, date, filename] = pathParts;
            
            console.log(`🗑️ Deleting orphan file: ${file.path}`);
            
            const response = await fetch(`/delete/${folder}/${date}/${filename}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Successfully deleted: ${file.path}`);
                results.success.push(file);
            } else {
                const errorData = await response.json();
                console.error(`❌ Failed to delete ${file.path}:`, errorData.error);
                results.failed.push({
                    file: file,
                    error: errorData.error
                });
            }
            
        } catch (error) {
            console.error(`❌ Error deleting ${file.path}:`, error);
            results.failed.push({
                file: file,
                error: error.message
            });
        }
    }
    
    console.log(`🏁 Cleanup complete: ${results.success.length} deleted, ${results.failed.length} failed`);
    return results;
}

/**
 * Find database records pointing to missing server files
 */
export async function scanForMissingFiles(database) {
    console.log('🔍 Scanning for database records with missing server files...');
    
    try {
        // Get all database records
        const dbRecords = await database.loadAllMedia();
        const missingFiles = [];
        
        for (const record of dbRecords) {
            if (record.serverPath) {
                try {
                    // Convert to web path and check if file exists
                    const webPath = '/' + record.serverPath.replace(/\\/g, '/');
                    const response = await fetch(webPath, { method: 'HEAD' });
                    
                    if (!response.ok) {
                        console.log(`❌ Missing server file for record ${record.id}: ${webPath}`);
                        missingFiles.push({
                            record: record,
                            serverPath: webPath,
                            error: `HTTP ${response.status}`
                        });
                    }
                } catch (error) {
                    console.log(`❌ Error checking file for record ${record.id}:`, error);
                    missingFiles.push({
                        record: record,
                        serverPath: record.serverPath,
                        error: error.message
                    });
                }
            }
        }
        
        console.log(`🗑️ Found ${missingFiles.length} database records with missing server files`);
        return missingFiles;
        
    } catch (error) {
        console.error('❌ Error scanning for missing files:', error);
        throw error;
    }
}

/**
 * Generate a comprehensive report of file system integrity
 */
export async function generateIntegrityReport(database) {
    console.log('📊 Generating file system integrity report...');
    
    try {
        const [orphanScan, missingScan] = await Promise.all([
            scanForOrphanFiles(database),
            scanForMissingFiles(database)
        ]);
        
        const report = {
            timestamp: new Date().toISOString(),
            serverFiles: orphanScan.totalServerFiles,
            databaseRecords: orphanScan.totalDbRecords,
            orphanFiles: orphanScan.orphanFiles,
            orphanCount: orphanScan.orphanCount,
            missingFiles: missingScan,
            missingCount: missingScan.length,
            integrityScore: calculateIntegrityScore(orphanScan, missingScan)
        };
        
        console.log('📊 Integrity Report Generated:');
        console.log(`  📁 Server Files: ${report.serverFiles}`);
        console.log(`  💾 Database Records: ${report.databaseRecords}`);
        console.log(`  🗑️ Orphan Files: ${report.orphanCount}`);
        console.log(`  ❌ Missing Files: ${report.missingCount}`);
        console.log(`  📊 Integrity Score: ${report.integrityScore}%`);
        
        return report;
        
    } catch (error) {
        console.error('❌ Error generating integrity report:', error);
        throw error;
    }
}

/**
 * Calculate integrity score (0-100%)
 */
function calculateIntegrityScore(orphanScan, missingScan) {
    const totalFiles = orphanScan.totalServerFiles;
    const totalRecords = orphanScan.totalDbRecords;
    const issues = orphanScan.orphanCount + missingScan.length;
    const totalItems = Math.max(totalFiles, totalRecords);
    
    if (totalItems === 0) return 100;
    
    const score = Math.max(0, Math.round(((totalItems - issues) / totalItems) * 100));
    return score;
}

/**
 * Auto-fix common integrity issues
 */
export async function autoFixIntegrityIssues(database, options = {}) {
    const {
        cleanupOrphans = false,
        removeMissingRecords = false,
        dryRun = true
    } = options;
    
    console.log(`🔧 Starting auto-fix (dry run: ${dryRun})...`);
    
    const report = await generateIntegrityReport(database);
    const fixes = {
        orphansDeleted: 0,
        recordsRemoved: 0,
        errors: []
    };
    
    // Fix orphan files
    if (cleanupOrphans && report.orphanFiles.length > 0) {
        if (!dryRun) {
            try {
                const cleanupResult = await cleanupOrphanFiles(report.orphanFiles);
                fixes.orphansDeleted = cleanupResult.success.length;
                fixes.errors.push(...cleanupResult.failed.map(f => f.error));
            } catch (error) {
                fixes.errors.push(`Orphan cleanup failed: ${error.message}`);
            }
        } else {
            console.log(`🔍 Would delete ${report.orphanFiles.length} orphan files`);
        }
    }
    
    // Fix missing file records
    if (removeMissingRecords && report.missingFiles.length > 0) {
        if (!dryRun) {
            try {
                for (const missing of report.missingFiles) {
                    await database.deleteMedia(missing.record.id);
                    fixes.recordsRemoved++;
                }
            } catch (error) {
                fixes.errors.push(`Record removal failed: ${error.message}`);
            }
        } else {
            console.log(`🔍 Would remove ${report.missingFiles.length} database records`);
        }
    }
    
    console.log('🔧 Auto-fix complete:', fixes);
    return fixes;
}
