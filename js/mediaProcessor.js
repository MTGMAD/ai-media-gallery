// mediaProcessor.js - Handles file upload and metadata extraction for both images and videos
// v2.1 - Top-aligned thumbnail defaults

/**
 * Main function to process uploaded files (images and videos)
 * Determines which parser to use based on filename and uploads to server
 */
export async function processFile(file, database) {
    console.log('🔍 processFile called with:', file.name, 'Type:', file.type);
    
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    
    if (!isVideo && !isImage) {
        throw new Error('Unsupported file type. Only images and MP4 videos are supported.');
    }
    
    let aiInfo = {};
    let metadata = {};
    let thumbnailData = null;
    
    if (isVideo) {
        // Handle video files
        console.log('Processing video:', file.name);
        aiInfo = extractVideoInfo(file);
        metadata = await extractVideoMetadata(file);
        thumbnailData = await generateVideoThumbnail(file);
    } else {
        // Handle image files
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Check if this is a ChatGPT image (filename starts with "ChatGPT")
        const isChatGPTImage = file.name.startsWith('ChatGPT');
        
        if (isChatGPTImage) {
            console.log('Processing ChatGPT image:', file.name);
            const pngTextChunks = extractPNGTextChunks(uint8Array);
            aiInfo = extractChatGPTInfo(pngTextChunks);
            metadata = pngTextChunks;
        } else {
            console.log('Processing regular image:', file.name);
            const pngTextChunks = extractPNGTextChunks(uint8Array);
            aiInfo = extractComfyUIInfo(pngTextChunks);
            metadata = pngTextChunks;
        }
    }
    
    console.log('🔍 About to try server upload...');
    
    try {
        // STEP 1: Upload file to server (for backup in images/videos folder)
        console.log('Attempting to upload to server:', file.name);
        const serverUploadResult = await uploadFileToServer(file);
        console.log('✅ Server upload successful:', serverUploadResult);
        
        // STEP 2: Store in Database (metadata only, no full image data for server-uploaded files)
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const mediaData = e.target.result;
                    
                    // Create a small thumbnail for database storage (max 200x200)
                    const smallThumbnail = await createSmallThumbnail(mediaData, isVideo ? thumbnailData : mediaData);
                    
                    const newMedia = {
                        title: aiInfo.title || file.name.replace(/\.[^/.]+$/, ''),
                        prompt: aiInfo.prompt || '',
                        model: aiInfo.model || '',
                        tags: aiInfo.tags || '',
                        notes: aiInfo.notes || '',
                        dateAdded: new Date().toISOString(),
                        imageData: '', // Don't store full image data when server upload succeeds
                        metadata: metadata,
                        serverPath: serverUploadResult.relativePath || null,
                        mediaType: isVideo ? 'video' : 'image',
                        thumbnailData: smallThumbnail, // Store small thumbnail only
                        thumbnailPosition: { x: 50, y: 25 } // TOP-ALIGNED: 25% from top instead of 50% center
                    };

                    // CRITICAL: Try to add to database, rollback server file if it fails
                    try {
                        const mediaId = await database.getInstance().images.add(newMedia);
                        console.log('✅ Database entry created successfully');
                        resolve({ 
                            success: true, 
                            imageId: mediaId, 
                            imageData: newMedia,
                            serverUpload: serverUploadResult 
                        });
                    } catch (dbError) {
                        console.error('❌ Database operation failed, rolling back server file:', dbError);
                        
                        // Rollback: Delete the uploaded file from server
                        try {
                            await deleteServerFile(serverUploadResult.relativePath);
                            console.log('✅ Server file rolled back successfully');
                        } catch (deleteError) {
                            console.error('❌ Failed to rollback server file:', deleteError);
                        }
                        
                        reject(new Error(`Database operation failed: ${dbError.message}. Server file has been cleaned up.`));
                    }
                } catch (error) {
                    // If any other error occurs, also try to rollback server file
                    console.error('❌ Processing error, rolling back server file:', error);
                    try {
                        await deleteServerFile(serverUploadResult.relativePath);
                        console.log('✅ Server file rolled back after processing error');
                    } catch (deleteError) {
                        console.error('❌ Failed to rollback server file after processing error:', deleteError);
                    }
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                // Also rollback on file read error
                deleteServerFile(serverUploadResult.relativePath).catch(console.error);
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(file);
        });
    } catch (serverError) {
        console.error('❌ Server upload failed:', serverError);
        console.error('Error details:', serverError.message);
        // Continue with IndexedDB storage even if server upload fails
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const mediaData = e.target.result;
                    
                    const newMedia = {
                        title: aiInfo.title || file.name.replace(/\.[^/.]+$/, ''),
                        prompt: aiInfo.prompt || '',
                        model: aiInfo.model || '',
                        tags: aiInfo.tags || '',
                        notes: aiInfo.notes || '',
                        dateAdded: new Date().toISOString(),
                        imageData: mediaData,
                        metadata: metadata,
                        serverPath: null,
                        mediaType: isVideo ? 'video' : 'image',
                        thumbnailData: thumbnailData || mediaData,
                        thumbnailPosition: { x: 50, y: 25 } // TOP-ALIGNED: 25% from top instead of 50% center
                    };

                    const mediaId = await database.getInstance().images.add(newMedia);
                    resolve({ 
                        success: true, 
                        imageId: mediaId, 
                        imageData: newMedia,
                        serverUpload: { success: false, error: serverError.message }
                    });
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
}

/**
 * Create a small thumbnail for database storage (max 200x200, high compression)
 */
async function createSmallThumbnail(originalData, sourceData) {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate dimensions to fit within 200x200 while maintaining aspect ratio
                const maxSize = 200;
                let { width, height } = img;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw the image with high compression
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to JPEG with high compression (quality 0.3)
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.3);
                resolve(thumbnailDataUrl);
            };
            
            img.onerror = () => {
                console.warn('Failed to create small thumbnail, using original');
                resolve(sourceData);
            };
            
            img.src = sourceData;
        } catch (error) {
            console.warn('Error creating small thumbnail:', error);
            resolve(sourceData);
        }
    });
}

/**
 * Generate video thumbnail from first frame
 */
async function generateVideoThumbnail(videoFile) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        video.addEventListener('loadeddata', () => {
            // Seek to 1 second or 10% of video duration, whichever is smaller
            const seekTime = Math.min(1, video.duration * 0.1);
            video.currentTime = seekTime;
        });
        
        video.addEventListener('seeked', () => {
            try {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                URL.revokeObjectURL(video.src);
                resolve(thumbnailDataUrl);
            } catch (error) {
                console.error('Error generating video thumbnail:', error);
                URL.revokeObjectURL(video.src);
                resolve(null);
            }
        });
        
        video.addEventListener('error', (e) => {
            console.error('Video loading error:', e);
            URL.revokeObjectURL(video.src);
            resolve(null);
        });
        
        video.src = URL.createObjectURL(videoFile);
        video.load();
    });
}

/**
 * Extract basic video information
 */
function extractVideoInfo(file) {
    const aiInfo = {
        title: file.name.replace(/\.[^/.]+$/, ''),
        prompt: '',
        model: '',
        tags: 'Video,AI-Generated',
        notes: `🎬 Video file\n📅 Added: ${new Date().toLocaleDateString()}\n💾 Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB\n`
    };
    
    return aiInfo;
}

/**
 * Extract video metadata (duration, dimensions, creation date, etc.)
 */
async function extractVideoMetadata(videoFile) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        
        video.addEventListener('loadedmetadata', () => {
            const metadata = {
                duration: video.duration,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                fileSize: videoFile.size,
                fileName: videoFile.name,
                fileType: videoFile.type,
                // Add creation date from file metadata
                fileLastModified: videoFile.lastModified ? new Date(videoFile.lastModified).toISOString() : null,
                creationDate: videoFile.lastModified ? new Date(videoFile.lastModified).toLocaleDateString() : 'Unknown'
            };
            
            URL.revokeObjectURL(video.src);
            resolve(metadata);
        });
        
        video.addEventListener('error', () => {
            URL.revokeObjectURL(video.src);
            resolve({
                fileName: videoFile.name,
                fileSize: videoFile.size,
                fileType: videoFile.type,
                // Add creation date even on error
                fileLastModified: videoFile.lastModified ? new Date(videoFile.lastModified).toISOString() : null,
                creationDate: videoFile.lastModified ? new Date(videoFile.lastModified).toLocaleDateString() : 'Unknown'
            });
        });
        
        video.src = URL.createObjectURL(videoFile);
        video.load();
    });
}

/**
 * Upload file to server (to save in images/videos folders)
 */
async function uploadFileToServer(file) {
    console.log('📤 Starting server upload for:', file.name);
    
    const formData = new FormData();
    formData.append('image', file); // Keep same field name for server compatibility
    
    console.log('📤 Sending POST request to /upload');
    
    const response = await fetch('/upload', {
        method: 'POST',
        body: formData
    });
    
    console.log('📤 Server response status:', response.status, response.statusText);
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error('📤 Server response error:', errorData);
        throw new Error(errorData.error || 'Upload failed');
    }
    
    const result = await response.json();
    console.log('📤 Server upload complete:', result);
    return result;
}

/**
 * Delete file from server (for rollback when database operations fail)
 */
async function deleteServerFile(relativePath) {
    if (!relativePath) {
        throw new Error('No file path provided for deletion');
    }
    
    console.log('🗑️ Attempting to delete server file:', relativePath);
    
    // Parse the relative path to extract folder, date, and filename
    // Expected format: "images/2025-07-23/filename.png" or "videos/2025-07-23/filename.mp4"
    const pathParts = relativePath.split('/');
    if (pathParts.length !== 3) {
        throw new Error(`Invalid path format: ${relativePath}. Expected: folder/date/filename`);
    }
    
    const [folder, date, filename] = pathParts;
    
    const response = await fetch(`/delete/${folder}/${date}/${filename}`, {
        method: 'DELETE'
    });
    
    console.log('🗑️ Delete response status:', response.status, response.statusText);
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error('🗑️ Delete response error:', errorData);
        throw new Error(errorData.error || 'Delete failed');
    }
    
    const result = await response.json();
    console.log('🗑️ Server file deleted successfully:', result);
    return result;
}

/**
 * Extract PNG text chunks (tEXt, iTXt, zTXt)
 * This is where ComfyUI and other tools store metadata
 */
function extractPNGTextChunks(uint8Array) {
    const chunks = {};
    
    if (uint8Array[0] !== 0x89 || uint8Array[1] !== 0x50 || uint8Array[2] !== 0x4E || uint8Array[3] !== 0x47) {
        return chunks; // Not a PNG file
    }
    
    let offset = 8; // Skip PNG signature
    
    while (offset < uint8Array.length - 8) {
        // Read chunk length (4 bytes, big-endian)
        const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | 
                      (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        
        // Read chunk type (4 bytes)
        const type = String.fromCharCode(uint8Array[offset + 4], uint8Array[offset + 5], 
                                        uint8Array[offset + 6], uint8Array[offset + 7]);
        
        // Check if it's a text chunk
        if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
            const dataStart = offset + 8;
            const chunkData = uint8Array.slice(dataStart, dataStart + length);
            
            if (type === 'tEXt') {
                const nullIndex = chunkData.indexOf(0);
                if (nullIndex !== -1) {
                    const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex));
                    const text = new TextDecoder().decode(chunkData.slice(nullIndex + 1));
                    chunks[keyword] = text;
                }
            }
        }
        
        // Move to next chunk
        offset += 8 + length + 4; // length + type + data + CRC
    }
    
    return chunks;
}

/**
 * Extract ChatGPT-specific information from PNG text chunks
 * Handles the special JSON format that ChatGPT images use
 */
function extractChatGPTInfo(chunks) {
    const aiInfo = {
        title: '',
        prompt: '',
        model: '',
        tags: '',
        notes: ''
    };

    // Look for the "prompt" key that contains ChatGPT JSON data
    if (chunks.prompt) {
        try {
            const chatGPTData = JSON.parse(chunks.prompt);
            console.log('ChatGPT data found:', chatGPTData);
            
            // Extract prompt and internal_prompt and combine them
            let combinedPrompt = '';
            
            if (chatGPTData.prompt) {
                combinedPrompt += `USER PROMPT:\n${chatGPTData.prompt}\n\n`;
            }
            
            if (chatGPTData.internal_prompt) {
                combinedPrompt += `INTERNAL PROMPT:\n${chatGPTData.internal_prompt}`;
            }
            
            aiInfo.prompt = combinedPrompt.trim();
            
            // Extract tool information for AI Model
            if (chatGPTData.tool) {
                aiInfo.model = chatGPTData.tool;
            }
            
            // Build detailed notes from ChatGPT metadata
            aiInfo.notes += `🤖 ChatGPT Image Generation\n`;
            aiInfo.notes += `📅 Generated: ${chatGPTData.date_generated || 'Unknown'}\n`;
            
            if (chatGPTData.filename) {
                aiInfo.notes += `📄 Original filename: ${chatGPTData.filename}\n`;
            }
            
            if (chatGPTData.style) {
                aiInfo.notes += `🎨 Style: ${chatGPTData.style}\n`;
            }
            
            if (chatGPTData.aspect_ratio) {
                aiInfo.notes += `📐 Aspect ratio: ${chatGPTData.aspect_ratio}\n`;
            }
            
            if (chatGPTData.resolution) {
                aiInfo.notes += `🔍 Resolution: ${chatGPTData.resolution}\n`;
            }
            
            if (chatGPTData.file_size_mb) {
                aiInfo.notes += `💾 File size: ${chatGPTData.file_size_mb} MB\n`;
            }
            
            if (chatGPTData.source_image) {
                aiInfo.notes += `🖼️ Source image: ${chatGPTData.source_image}\n`;
            }
            
            // Set appropriate tags
            aiInfo.tags = 'ChatGPT,AI-Generated,Image-Gen';
            
            console.log('Extracted ChatGPT info:', aiInfo);
            
        } catch (e) {
            console.error('Error parsing ChatGPT data:', e);
            aiInfo.notes += '🤖 ChatGPT data found but could not parse JSON\n';
            aiInfo.tags = 'ChatGPT,AI-Generated';
        }
    }
    
    return aiInfo;
}

/**
 * Extract ComfyUI-specific information from PNG text chunks
 * Handles workflow and prompt data from ComfyUI
 */
function extractComfyUIInfo(chunks) {
    const aiInfo = {
        title: '',
        prompt: '',
        model: '',
        tags: '',
        notes: ''
    };

    // ComfyUI typically stores workflow in 'workflow' and prompt info in 'prompt'
    if (chunks.workflow) {
        try {
            const workflow = JSON.parse(chunks.workflow);
            
            // Add generation info first
            aiInfo.notes += `📅 Generated: ${new Date().toLocaleDateString()}\n`;
            
            // Handle different workflow structures
            let nodeCount = 0;
            let nodeTypes = new Set();
            
            if (workflow.nodes && Array.isArray(workflow.nodes)) {
                // New workflow format with nodes array
                nodeCount = workflow.nodes.length;
                workflow.nodes.forEach(node => {
                    if (node.type) {
                        nodeTypes.add(node.type);
                    }
                });
            } else if (typeof workflow === 'object') {
                // Old workflow format with direct node objects
                nodeCount = Object.keys(workflow).length;
                for (const nodeId in workflow) {
                    const node = workflow[nodeId];
                    if (node.class_type) {
                        nodeTypes.add(node.class_type);
                    }
                }
            }
            
            aiInfo.notes += `🔧 ComfyUI Workflow detected (${nodeCount} nodes)\n`;
            
            // Add node types to notes if found
            if (nodeTypes.size > 0) {
                const sortedNodeTypes = Array.from(nodeTypes).sort();
                aiInfo.notes += `🔗 Node Types: ${sortedNodeTypes.join(', ')}\n`;
            }
            
            // Try to extract prompt from workflow nodes (new format)
            if (workflow.nodes && Array.isArray(workflow.nodes)) {
                for (const node of workflow.nodes) {
                    if (node.type === 'CLIPTextEncode' && node.widgets_values && node.widgets_values.length > 0) {
                        const text = node.widgets_values[0];
                        if (typeof text === 'string' && text.length > 10 && !aiInfo.prompt) {
                            aiInfo.prompt = text;
                            break;
                        }
                    }
                }
            } else {
                // Try to extract prompt from workflow nodes (old format)
                for (const nodeId in workflow) {
                    const node = workflow[nodeId];
                    if (node.inputs && node.inputs.text && typeof node.inputs.text === 'string') {
                        if (node.inputs.text.length > 10 && !aiInfo.prompt) {
                            aiInfo.prompt = node.inputs.text;
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            aiInfo.notes += '🔧 ComfyUI Workflow data found (raw)\n';
        }
    }

    if (chunks.prompt) {
        try {
            const promptData = JSON.parse(chunks.prompt);
            if (typeof promptData === 'object') {
                // Extract useful info from prompt data
                for (const key in promptData) {
                    if (typeof promptData[key] === 'string' && promptData[key].length > 10 && !aiInfo.prompt) {
                        aiInfo.prompt = promptData[key];
                        break;
                    }
                }
            }
        } catch (e) {
            // If not JSON, treat as plain text
            if (chunks.prompt.length > 5 && !aiInfo.prompt) {
                aiInfo.prompt = chunks.prompt;
            }
        }
    }

    // Check for parameters (AUTOMATIC1111 style)
    if (chunks.parameters) {
        aiInfo.prompt = aiInfo.prompt || chunks.parameters;
        aiInfo.notes += '🤖 A1111 Parameters detected\n';
    }

    // Check for Software/model info
    if (chunks.Software) {
        aiInfo.model = chunks.Software;
    }
    
    if (chunks.software) {
        aiInfo.model = chunks.software;
    }

    // Set tags if we have ComfyUI data
    if (chunks.workflow || chunks.prompt) {
        aiInfo.tags = aiInfo.tags || 'ComfyUI,AI-Generated';
    }
    
    return aiInfo;
}

/**
 * Utility function to handle file selection from input
 */
export function handleFileSelect(fileInput, database, onComplete) {
    const files = Array.from(fileInput.files);
    
    // Process files one by one to avoid overwhelming the server
    processFilesSequentially(files, database, onComplete);
}

/**
 * Utility function to handle drag and drop
 */
export function handleFileDrop(event, database, onComplete) {
    event.preventDefault();
    
    // Accept both images and videos
    const files = Array.from(event.dataTransfer.files).filter(file => 
        file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    
    // Process files one by one to avoid overwhelming the server
    processFilesSequentially(files, database, onComplete);
}

/**
 * Process files one by one (sequential) to avoid server overload
 */
async function processFilesSequentially(files, database, onComplete) {
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        try {
            console.log(`Processing file ${i + 1}/${files.length}: ${files[i].name}`);
            const result = await processFile(files[i], database);
            results.push(result);
            successCount++;
            
            if (result.serverUpload && !result.serverUpload.success) {
                console.warn(`Server backup failed for ${files[i].name}: ${result.serverUpload.error}`);
            }
        } catch (error) {
            console.error(`Error processing ${files[i].name}:`, error);
            results.push({ success: false, filename: files[i].name, error: error.message });
            errorCount++;
        }
    }
    
    console.log(`Completed: ${successCount} successful, ${errorCount} failed`);
    
    if (errorCount > 0) {
        alert(`Processed ${successCount} files successfully. ${errorCount} files had errors.`);
    } else if (successCount > 0) {
        console.log(`All ${successCount} files processed successfully!`);
    }
    
    if (onComplete) {
        try {
            onComplete(results);
        } catch (callbackError) {
            console.error('Error in completion callback:', callbackError);
        }
    }
}
