import { showNotification } from './utils.js';
import { generateIntegrityReport, cleanupOrphanFiles } from './orphanFileManager.js';
import { cleanupDatabaseStorage, isCleanupNeeded, getStorageStats } from './databaseCleanup.js';
import { database } from './clientDatabase.js';

// Handle orphan file cleanup
export async function handleOrphanCleanup() {
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
export async function checkAndOfferCleanup() {
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
