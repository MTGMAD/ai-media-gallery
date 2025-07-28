import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import serverDB from './js/serverDatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3015;

// Enable CORS and JSON parsing with increased limits for large metadata
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Serve favicon and related files with proper MIME types
app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon');
  res.sendFile(path.join(__dirname, 'favicon.ico'));
});

app.get('/favicon-16x16.png', (req, res) => {
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'favicon-16x16.png'));
});

app.get('/favicon-32x32.png', (req, res) => {
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'favicon-32x32.png'));
});

app.get('/apple-touch-icon.png', (req, res) => {
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'apple-touch-icon.png'));
});

app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'site.webmanifest'));
});

app.get('/android-chrome-192x192.png', (req, res) => {
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'android-chrome-192x192.png'));
});

app.get('/android-chrome-512x512.png', (req, res) => {
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'android-chrome-512x512.png'));
});

// Configure multer for file uploads with date-based organization and media type separation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine if this is a video or image file
    const isVideo = file.mimetype.startsWith('video/');
    const mediaFolder = isVideo ? 'videos' : 'images';
    
    // Create date-based folder (YYYY-MM-DD) using server's local timezone
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    
    const dateFolder = localDate; // This will be in YYYY-MM-DD format
    
    console.log(`📅 Creating folder for local date: ${dateFolder}`);
    console.log(`📅 Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    
    const uploadPath = path.join(__dirname, mediaFolder, dateFolder);
    
    // Create directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Use timestamp + original filename to avoid conflicts
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitizedName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit (increased for videos)
  },
  fileFilter: function (req, file, cb) {
    // Allow both image and video files
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
});

/**
 * Generate ultra-high-quality video thumbnail using FFmpeg
 * @param {string} videoPath - Full path to the video file
 * @param {string} filename - Original filename for thumbnail naming
 * @returns {Promise<string>} - Path to generated thumbnail
 */
async function generateVideoThumbnailFFmpeg(videoPath, filename) {
  // Create thumbnails directory if it doesn't exist
  const thumbnailsDir = path.join(__dirname, 'thumbnails');
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
    console.log(`📁 Created thumbnails directory: ${thumbnailsDir}`);
  }

  // Generate thumbnail filename (replace video extension with .png for lossless quality)
  const thumbnailName = filename.replace(/\.[^/.]+$/, '_thumb.png');
  const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

  // Ultra-high-quality FFmpeg command
  // -ss 00:00:02: seek to 2 seconds (better frame quality)
  // -i: input video file
  // -vframes 1: extract only 1 frame
  // -vf scale=1200:-1: scale to 1200px width for ultra-high quality
  // -pix_fmt rgb24: use RGB pixel format for best quality
  // -compression_level 0: PNG with no compression (lossless)
  // -y: overwrite output file if exists
  const ffmpegCommand = `ffmpeg -ss 00:00:02 -i "${videoPath}" -vframes 1 -vf "scale=1200:-1" -pix_fmt rgb24 -compression_level 0 -y "${thumbnailPath}"`;

  console.log(`🎬 Running ultra-high-quality FFmpeg command: ${ffmpegCommand}`);

  try {
    const { stdout, stderr } = await execAsync(ffmpegCommand, { timeout: 30000 }); // 30 second timeout
    
    if (stderr) {
      console.log(`🎬 FFmpeg stderr: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`🎬 FFmpeg stdout: ${stdout}`);
    }
    
    // Check if thumbnail was created successfully
    if (fs.existsSync(thumbnailPath)) {
      const stats = fs.statSync(thumbnailPath);
      console.log(`✅ Ultra-high-quality thumbnail generated: ${thumbnailName} (${(stats.size / 1024).toFixed(1)}KB)`);
      return thumbnailPath;
    } else {
      throw new Error('Thumbnail file was not created by FFmpeg');
    }
  } catch (error) {
    console.error(`❌ FFmpeg error details:`, error);
    
    // Try a fallback command with different settings
    console.log(`🔄 Trying fallback FFmpeg command...`);
    const fallbackCommand = `ffmpeg -ss 00:00:01 -i "${videoPath}" -vframes 1 -q:v 1 -vf "scale=800:-1" -y "${thumbnailPath.replace('.png', '.jpg')}"`;
    
    try {
      await execAsync(fallbackCommand, { timeout: 30000 });
      const fallbackPath = thumbnailPath.replace('.png', '.jpg');
      
      if (fs.existsSync(fallbackPath)) {
        const stats = fs.statSync(fallbackPath);
        console.log(`✅ Fallback thumbnail generated: ${path.basename(fallbackPath)} (${(stats.size / 1024).toFixed(1)}KB)`);
        return fallbackPath;
      }
    } catch (fallbackError) {
      console.error(`❌ Fallback FFmpeg also failed:`, fallbackError);
    }
    
    throw error;
  }
}

// Initialize database on server start
serverDB.init().catch(console.error);

// DATABASE API ENDPOINTS

// Get all media items
app.get('/api/media', async (req, res) => {
  try {
    const media = await serverDB.getAllMedia();
    res.json({ success: true, media });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Add new media item
app.post('/api/media', async (req, res) => {
  try {
    const mediaData = req.body;
    console.log('📥 Received media data:', {
      title: mediaData.title,
      mediaType: mediaData.mediaType,
      hasMetadata: !!mediaData.metadata,
      metadataKeys: mediaData.metadata ? Object.keys(mediaData.metadata) : [],
      serverPath: mediaData.serverPath
    });
    
    const id = await serverDB.addMedia(mediaData);
    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Error adding media:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to add media: ' + error.message });
  }
});

// Update media item
app.put('/api/media/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updateData = req.body;
    const changes = await serverDB.updateMedia(id, updateData);
    res.json({ success: true, changes });
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

// Delete media item
app.delete('/api/media/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const changes = await serverDB.deleteMedia(id);
    res.json({ success: true, changes });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Get media by ID
app.get('/api/media/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const media = await serverDB.getMediaById(id);
    if (media) {
      res.json({ success: true, media });
    } else {
      res.status(404).json({ error: 'Media not found' });
    }
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Search media
app.get('/api/media/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;
    const media = await serverDB.searchMedia(searchTerm);
    res.json({ success: true, media });
  } catch (error) {
    console.error('Error searching media:', error);
    res.status(500).json({ error: 'Failed to search media' });
  }
});

// Get database statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await serverDB.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Import data from client export (for migration)
app.post('/api/migrate', async (req, res) => {
  try {
    const exportData = req.body;
    console.log('📥 Received migration request with', exportData?.images?.length || 0, 'items');
    
    const result = await serverDB.importData(exportData);
    res.json({ 
      success: true, 
      imported: result.imported, 
      errors: result.errors,
      message: `Successfully imported ${result.imported} items with ${result.errors} errors`
    });
  } catch (error) {
    console.error('Error during migration:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// Export all data (backup functionality)
app.get('/api/export', async (req, res) => {
  try {
    const allMedia = await serverDB.getAllMedia();
    const exportData = {
      version: '3.0-server',
      exportDate: new Date().toISOString(),
      totalItems: allMedia.length,
      images: allMedia
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-gallery-backup.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle single file upload (supports both images and videos)
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      relativePath: path.relative(__dirname, req.file.path),
      uploadDate: new Date().toISOString(),
      mediaType: req.file.mimetype.startsWith('video/') ? 'video' : 'image'
    };

    const mediaType = fileInfo.mediaType === 'video' ? 'Video' : 'Image';
    const folder = fileInfo.mediaType === 'video' ? 'videos' : 'images';
    console.log(`📁 ${mediaType} saved: ${fileInfo.relativePath} (in ${folder}/ directory)`);
    res.json(fileInfo);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Handle multiple file uploads (supports both images and videos)
app.post('/upload-multiple', upload.array('images', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const filesInfo = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      relativePath: path.relative(__dirname, file.path),
      uploadDate: new Date().toISOString(),
      mediaType: file.mimetype.startsWith('video/') ? 'video' : 'image'
    }));

    const imageCount = filesInfo.filter(f => f.mediaType === 'image').length;
    const videoCount = filesInfo.filter(f => f.mediaType === 'video').length;
    
    console.log(`📁 ${filesInfo.length} files saved to organized directories:`);
    if (imageCount > 0) console.log(`  📷 ${imageCount} images → images/ directory`);
    if (videoCount > 0) console.log(`  🎬 ${videoCount} videos → videos/ directory`);
    
    res.json({ success: true, files: filesInfo });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// DELETE endpoint for removing files from server
app.delete('/delete/:folder/:date/:filename', (req, res) => {
  try {
    const { folder, date, filename } = req.params;
    const relativePath = `${folder}/${date}/${filename}`;
    const fullPath = path.join(__dirname, relativePath);
    
    // Security check: ensure the path is within our project directory
    const resolvedPath = path.resolve(fullPath);
    const projectRoot = path.resolve(__dirname);
    
    if (!resolvedPath.startsWith(projectRoot)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the file
    fs.unlinkSync(resolvedPath);
    
    console.log(`🗑️ Deleted file: ${relativePath}`);
    res.json({ success: true, message: 'File deleted successfully', path: relativePath });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed: ' + error.message });
  }
});

// Get list of uploaded media organized by date (searches both images/ and videos/ directories)
app.get('/api/images', (req, res) => {
  try {
    const imagesDir = path.join(__dirname, 'images');
    const videosDir = path.join(__dirname, 'videos');
    
    const mediaByDate = {};
    let totalImages = 0;
    let totalVideos = 0;
    const allDates = new Set();

    // Helper function to process a directory (images or videos)
    function processDirectory(baseDir, mediaType) {
      if (!fs.existsSync(baseDir)) {
        return;
      }

      const dateDirectories = fs.readdirSync(baseDir)
        .filter(item => fs.statSync(path.join(baseDir, item)).isDirectory())
        .sort();

      dateDirectories.forEach(dateDir => {
        allDates.add(dateDir);
        
        if (!mediaByDate[dateDir]) {
          mediaByDate[dateDir] = [];
        }

        const datePath = path.join(baseDir, dateDir);
        const fileExtensions = mediaType === 'image' 
          ? /\.(jpg|jpeg|png|gif|webp)$/i 
          : /\.(mp4|mov|avi|mkv)$/i;

        const files = fs.readdirSync(datePath)
          .filter(file => fileExtensions.test(file))
          .map(file => {
            const stats = fs.statSync(path.join(datePath, file));
            const folderName = mediaType === 'image' ? 'images' : 'videos';
            
            if (mediaType === 'image') {
              totalImages++;
            } else {
              totalVideos++;
            }
            
            return {
              filename: file,
              path: `/${folderName}/${dateDir}/${file}`,
              size: stats.size,
              modified: stats.mtime,
              mediaType: mediaType
            };
          });
        
        mediaByDate[dateDir].push(...files);
      });
    }

    // Process both images and videos directories
    processDirectory(imagesDir, 'image');
    processDirectory(videosDir, 'video');

    // Sort dates in reverse order (most recent first)
    const sortedDates = Array.from(allDates).sort().reverse();

    // Remove empty date entries and sort files within each date
    sortedDates.forEach(date => {
      if (mediaByDate[date] && mediaByDate[date].length === 0) {
        delete mediaByDate[date];
      } else if (mediaByDate[date]) {
        // Sort files within each date by modification time (newest first)
        mediaByDate[date].sort((a, b) => new Date(b.modified) - new Date(a.modified));
      }
    });

    res.json({
      success: true,
      dates: Object.keys(mediaByDate),
      mediaByDate: mediaByDate,
      totalImages: totalImages,
      totalVideos: totalVideos,
      totalFiles: totalImages + totalVideos
    });
  } catch (error) {
    console.error('Error listing media:', error);
    res.status(500).json({ error: 'Failed to list media files' });
  }
});

// Serve uploaded images statically
app.use('/images', express.static(path.join(__dirname, 'images')));

// Serve uploaded videos statically
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Serve generated thumbnails statically
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 100MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Media Gallery server running on port ${PORT}`);
  console.log(`📁 Media organization:`);
  console.log(`  📷 Images: ./images/YYYY-MM-DD/`);
  console.log(`  🎬 Videos: ./videos/YYYY-MM-DD/`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  console.log(`📷 Supports: Images (PNG, JPG, GIF, WebP)`);
  console.log(`🎬 Supports: Videos (MP4, MOV, AVI, MKV)`);
  
  // Create both media directories if they don't exist
  const imagesDir = path.join(__dirname, 'images');
  const videosDir = path.join(__dirname, 'videos');
  
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log(`📁 Created images directory: ${imagesDir}`);
  }
  
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
    console.log(`📁 Created videos directory: ${videosDir}`);
  }
});
