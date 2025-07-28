// modalVideoControls.js - Handles video playback controls within the modal

import { showNotification } from './utils.js';

// Setup video control functionality
export function setupVideoControls(videoElement) {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const loopToggleBtn = document.getElementById('loopToggleBtn');
    const loopIndicator = document.getElementById('loopIndicator');
    
    // Update play/pause button text
    function updatePlayPauseButton() {
        playPauseBtn.textContent = videoElement.paused ? '▶️ Play' : '⏸️ Pause';
    }
    
    // Update loop indicator
    function updateLoopIndicator() {
        loopIndicator.textContent = videoElement.loop ? '🔄 Loop: ON' : '🔄 Loop: OFF';
        loopToggleBtn.textContent = videoElement.loop ? '🔄 Disable Loop' : '🔄 Enable Loop';
    }
    
    // Play/Pause functionality
    playPauseBtn.onclick = () => {
        if (videoElement.paused) {
            videoElement.play().catch(e => {
                console.error('Error playing video:', e);
                showNotification('Unable to play video. Browser may be blocking autoplay.', 'error');
            });
        } else {
            videoElement.pause();
        }
    };
    
    // Loop toggle functionality
    loopToggleBtn.onclick = () => {
        videoElement.loop = !videoElement.loop;
        updateLoopIndicator();
    };
    
    // Update buttons when video state changes
    videoElement.addEventListener('play', updatePlayPauseButton);
    videoElement.addEventListener('pause', updatePlayPauseButton);
    videoElement.addEventListener('loadstart', () => {
        updatePlayPauseButton();
        updateLoopIndicator();
    });
    
    // Initialize button states
    updatePlayPauseButton();
    updateLoopIndicator();
}
