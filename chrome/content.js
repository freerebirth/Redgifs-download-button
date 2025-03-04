// Track processed players to prevent duplicate buttons
const processedPlayers = new WeakSet();

// Current extension version - update this when releasing new versions
const CURRENT_VERSION = '1.2';
const GITHUB_REPO = 'https://github.com/freerebirth/Redgifs-download-button';

// Add update notification styles
const updateStyles = document.createElement('style');
updateStyles.textContent = `
.redgifs-update-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.9);
    border-radius: 8px;
    padding: 16px;
    max-width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
    display: none;
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

.redgifs-update-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.redgifs-update-content a {
    color: #2196F3;
    text-decoration: none;
    padding: 8px 16px;
    background: rgba(33, 150, 243, 0.1);
    border-radius: 4px;
    text-align: center;
    transition: background 0.3s;
}

.redgifs-update-content a:hover {
    background: rgba(33, 150, 243, 0.2);
}

.redgifs-update-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.redgifs-update-button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    flex: 1;
    transition: background 0.3s;
}

.redgifs-update-button:hover {
    background: rgba(255, 255, 255, 0.2);
}

.redgifs-update-button.dismiss {
    background: transparent;
}
`;
document.head.appendChild(updateStyles);

// Check for updates
async function checkForUpdates() {
    try {
        const response = await fetch('https://api.github.com/repos/freerebirth/Redgifs-download-button/releases/latest');
        if (!response.ok) return;
        
        const release = await response.json();
        const latestVersion = release.tag_name.replace('v', '');
        
        // Compare versions
        if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
            showUpdateNotification(latestVersion, release.html_url);
        }
    } catch (error) {
        console.error('Update check failed:', error);
    }
}

// Compare version numbers
function compareVersions(v1, v2) {
    const parts1 = v1.split('.');
    const parts2 = v2.split('.');
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parseInt(parts1[i] || 0);
        const num2 = parseInt(parts2[i] || 0);
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

// Show update notification
function showUpdateNotification(newVersion, updateUrl) {
    // Check if user has dismissed this version
    const dismissedVersion = localStorage.getItem('redgifs-dismissed-version');
    if (dismissedVersion === newVersion) return;
    
    const notification = document.createElement('div');
    notification.className = 'redgifs-update-notification';
    notification.innerHTML = `
        <div class="redgifs-update-content">
            <div>
                <strong>Update Available!</strong>
                <p>Version ${newVersion} of RedGifs Downloader is available.</p>
            </div>
            <a href="${updateUrl}" target="_blank">Download Update</a>
            <div class="redgifs-update-buttons">
                <button class="redgifs-update-button remind">Remind Later</button>
                <button class="redgifs-update-button dismiss">Dismiss</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    // Show with animation
    setTimeout(() => notification.style.display = 'block', 100);
    
    // Handle button clicks
    notification.querySelector('.remind').addEventListener('click', () => {
        notification.remove();
    });
    
    notification.querySelector('.dismiss').addEventListener('click', () => {
        localStorage.setItem('redgifs-dismissed-version', newVersion);
        notification.remove();
    });
}

// Check for updates when the script loads (after a delay)
setTimeout(checkForUpdates, 5000);

// Create and add download button
async function addDownloadButton(container) {
    // Generate a unique ID for the container if it doesn't have one
    if (!container.id) {
        container.id = 'redgifs-container-' + Math.random().toString(36).substring(7);
    }
    
    // Check if a button already exists for this container
    const existingButtons = document.querySelectorAll('.redgifs-download-btn-wrapper');
    for (const existing of existingButtons) {
        if (existing.dataset.containerId === container.id) {
            updateButtonPosition(existing, container);
            return;
        }
    }
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'redgifs-download-btn';
    downloadBtn.innerHTML = '⬇️ Download';
    downloadBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000000;
        padding: 4px 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: 0.3s;
        display: flex;
        align-items: center;
        gap: 4px;
        transform: scale(1);
        pointer-events: auto;
    `;

    downloadBtn.addEventListener('mouseover', () => {
        downloadBtn.style.background = 'rgba(0, 0, 0, 0.9)';
        downloadBtn.style.transform = 'scale(1.05)';
    });

    downloadBtn.addEventListener('mouseout', () => {
        downloadBtn.style.background = 'rgba(0, 0, 0, 0.7)';
        downloadBtn.style.transform = 'scale(1)';
    });

    downloadBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleDownload(event);
    });

    // Create a wrapper div with fixed positioning
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'redgifs-download-btn-wrapper';
    buttonWrapper.dataset.containerId = container.id;
    buttonWrapper.style.cssText = `
        position: absolute;
        top: 10px;
        right: 15px;
        z-index: 1000000;
        pointer-events: none;
        opacity: 1;
        transition: all 0.3s ease;
    `;
    
    // Add the button to the wrapper
    buttonWrapper.appendChild(downloadBtn);
    container.appendChild(buttonWrapper);
    
    // Store references for cleanup
    if (!container.redgifsDownloaderData) {
        container.redgifsDownloaderData = {};
    }
    container.redgifsDownloaderData.buttonWrapper = buttonWrapper;
    
    // Make sure the button is visible
    setTimeout(() => {
        downloadBtn.style.display = 'flex';
        downloadBtn.style.visibility = 'visible';
        downloadBtn.style.opacity = '1';
        downloadBtn.style.pointerEvents = 'auto';
    }, 100);
}

// Helper function to update button position
function updateButtonPosition(wrapper, container) {
    if (!document.body.contains(container)) {
        if (wrapper.parentElement) {
            wrapper.parentElement.removeChild(wrapper);
        }
        return;
    }
    return;
}

// Add scroll and resize listeners for all button wrappers
function initializePositionUpdates() {
    // No need for scroll or resize listeners anymore
}

// Handle download button click
async function handleDownload(event) {
    const btn = event.target;
    const container = btn.closest('.redgifs-download-btn-wrapper').dataset.containerId 
        ? document.getElementById(btn.closest('.redgifs-download-btn-wrapper').dataset.containerId)
        : btn.closest('.GifPreviewV2');
        
    if (!container) {
        return;
    }

    const videoId = getVideoIdFromContainer(container);
    if (!videoId) {
        return;
    }

    btn.innerHTML = '⏳ Fetching...';
    btn.style.pointerEvents = 'none';

    try {
        // Try to get the m3u8 manifest first
        const apiUrl = `https://api.redgifs.com/v2/gifs/${videoId}/hd.m3u8`;
        const manifest = await fetchM3u8(apiUrl);
        
        // Extract direct m4s URL from manifest
        const m4sUrl = extractM4sUrl(manifest, videoId);
        if (!m4sUrl) {
            throw new Error('Could not extract video URL from manifest');
        }
        
        await downloadDirectVideo(m4sUrl, videoId, btn);
    } catch (error) {
        // Try fallback method with direct m4s URL
        tryFallbackDownload(videoId, btn);
    }
}

// Fallback download method
async function tryFallbackDownload(videoId, btn) {
    try {
        // Construct the direct m4s URL
        const capitalizedId = videoId.charAt(0).toUpperCase() + videoId.slice(1);
        const directUrl = `https://media.redgifs.com/${capitalizedId}.m4s`;
        
        // Use chrome.downloads API to download the file directly
        chrome.runtime.sendMessage({
            type: 'DOWNLOAD_DIRECT',
            url: directUrl,
            filename: `redgifs_${videoId}.mp4`
        }, (response) => {
            if (response && response.success) {
                btn.innerHTML = '✅ Downloaded';
                setTimeout(() => {
                    btn.innerHTML = '⬇️ Download';
                    btn.style.pointerEvents = 'auto';
                }, 2000);
            } else {
                btn.innerHTML = '❌ Error';
                setTimeout(() => {
                    btn.innerHTML = '⬇️ Download';
                    btn.style.pointerEvents = 'auto';
                }, 2000);
            }
        });
    } catch (error) {
        btn.innerHTML = '❌ Error';
        setTimeout(() => {
            btn.innerHTML = '⬇️ Download';
            btn.style.pointerEvents = 'auto';
        }, 2000);
    }
}

// Extract m4s URL from m3u8 manifest
function extractM4sUrl(manifest, videoId) {
    const lines = manifest.split('\n');
    
    // Look for direct m4s URL
    for (const line of lines) {
        if (line.includes('.m4s') || line.includes('.mp4')) {
            // Extract URL from EXT-X-MAP directive
            if (line.includes('EXT-X-MAP:URI=')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch && uriMatch[1]) {
                    return uriMatch[1];
                }
            }
            
            // If it's a direct URL without attributes
            if (line.startsWith('http') || line.startsWith('/')) {
                return line.trim();
            }
        }
    }
    
    // If no direct URL found, try to construct it
    const baseUrl = `https://media.redgifs.com/${videoId.charAt(0).toUpperCase() + videoId.slice(1)}.m4s`;
    return baseUrl;
}

// Download direct video file
async function downloadDirectVideo(url, videoId, btn) {
    btn.innerHTML = '⏳ Downloading...';
    
    try {
        // Use chrome.downloads API to download the file directly
        chrome.runtime.sendMessage({
            type: 'DOWNLOAD_DIRECT',
            url: url,
            filename: `redgifs_${videoId}.mp4`
        }, (response) => {
            if (response && response.success) {
                btn.innerHTML = '✅ Downloaded';
                setTimeout(() => {
                    btn.innerHTML = '⬇️ Download';
                    btn.style.pointerEvents = 'auto';
                }, 2000);
            } else {
                btn.innerHTML = '❌ Error';
                setTimeout(() => {
                    btn.innerHTML = '⬇️ Download';
                    btn.style.pointerEvents = 'auto';
                }, 2000);
            }
        });
    } catch (error) {
        btn.innerHTML = '❌ Error';
        setTimeout(() => {
            btn.innerHTML = '⬇️ Download';
            btn.style.pointerEvents = 'auto';
        }, 2000);
    }
}

// Get video ID from container
function getVideoIdFromContainer(container) {
    // Helper function to find GifPreviewV2 parent
    const findGifPreviewParent = (element) => {
        let current = element;
        while (current) {
            if (current.classList && current.classList.contains('GifPreviewV2')) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    };
    
    // If we're in a TapTracker or PlayerV2, look for GifPreviewV2 parent
    if (container.classList.contains('TapTracker') || container.classList.contains('PlayerV2')) {
        const gifPreview = findGifPreviewParent(container);
        if (gifPreview) {
            container = gifPreview;
        }
    }
    
    // First try to get ID from container's ID (most reliable)
    if (container.id && container.id.startsWith('gif_')) {
        const id = container.id.replace('gif_', '');
        return id;
    }
    
    // Try to find video element and get ID from poster
    const video = container.querySelector('video');
    if (video && video.poster) {
        const posterMatch = video.poster.match(/\/([^\/]+)-mobile\.jpg$/);
        if (posterMatch && posterMatch[1]) {
            return posterMatch[1];
        }
    }
    
    // Try to find ID in the current URL
    if (window.location.pathname.includes('/watch/')) {
        const urlMatch = window.location.pathname.match(/\/watch\/([^\/]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
    }
    
    // Try to find ID in meta tags
    const metaTags = document.querySelectorAll('meta[property="og:url"], meta[property="og:video"]');
    for (const meta of metaTags) {
        const content = meta.getAttribute('content');
        if (content) {
            const metaMatch = content.match(/\/([^\/]+)(?:\/hd|$)/);
            if (metaMatch && metaMatch[1]) {
                return metaMatch[1];
            }
        }
    }
    
    // Try to find ID in any data attributes
    const elements = container.querySelectorAll('[data-id], [data-gif-id]');
    for (const el of elements) {
        const dataId = el.getAttribute('data-id') || el.getAttribute('data-gif-id');
        if (dataId) {
            return dataId;
        }
    }

    // Try to find ID in img alt attributes (they often contain the ID)
    const images = container.querySelectorAll('img[alt]');
    for (const img of images) {
        const alt = img.getAttribute('alt');
        if (alt && alt.startsWith('Poster for ')) {
            const id = alt.replace('Poster for ', '');
            if (id && !id.includes(' ')) {
                return id;
            }
        }
    }

    return null;
}

// Download file
function downloadFile(blob, filename, btn) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        btn.innerHTML = '✅ Downloaded';
        setTimeout(() => {
            btn.innerHTML = '⬇️ Download';
            btn.style.pointerEvents = 'auto';
        }, 2000);
    }, 100);
}

// Fetch m3u8 content
async function fetchM3u8(url) {
    try {
        // Use XHR instead of fetch to avoid CORS issues
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.withCredentials = true; // Important for CORS with credentials
        
        // Create a promise to handle the XHR request
        const text = await new Promise((resolve, reject) => {
        xhr.onload = function() {
            if (xhr.status === 200) {
                resolve(xhr.responseText);
            } else {
                reject(new Error(`Failed to fetch m3u8: ${xhr.status}`));
            }
        };
        
        xhr.onerror = function() {
            reject(new Error('Network error fetching m3u8'));
        };
        
            xhr.timeout = 10000; // 10 second timeout
        xhr.send();
        });
        
        return text;
    } catch (error) {
        throw error;
    }
}

// Check if download button should be added
function addDownloadButtonIfNeeded(container) {
    if (!container) {
        return;
    }

    // If we're starting with a GifPreviewV2, process it directly
    if (container.classList.contains('GifPreviewV2')) {
        const tapTracker = container.querySelector('.TapTracker');
        if (tapTracker) {
            processContainer(tapTracker);
        }
        return;
    }

    // If we're starting with a TapTracker or PlayerV2, find its GifPreviewV2 parent
    const gifPreview = container.closest('.GifPreviewV2');
    if (gifPreview) {
        processContainer(container);
    } else {
        if (element.classList && (element.classList.contains('TapTracker') || element.classList.contains('PlayerV2'))) {
            addDownloadButton(element);
        }
    }
}

// Helper function to process container
function processContainer(container) {
    // Generate ID if needed
    if (!container.id) {
        container.id = 'redgifs-container-' + Math.random().toString(36).substring(7);
    }

    // Check if already processed
    if (processedPlayers.has(container)) {
        return;
    }

    // Check for existing button
    const existingButtons = document.querySelectorAll('.redgifs-download-btn-wrapper');
    for (const existing of existingButtons) {
        if (existing.dataset.containerId === container.id) {
            updateButtonPosition(existing, container);
            return;
        }
    }

    // Add the button
    processedPlayers.add(container);
    addDownloadButton(container);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initObservers();
        initializePositionUpdates();
    });
} else {
    initObservers();
    initializePositionUpdates();
}

// Initialize observers
function initObservers() {
    // Clean up function for button wrappers
    const cleanupButtonWrappers = () => {
        const wrappers = document.querySelectorAll('.redgifs-download-btn-wrapper');
        wrappers.forEach(wrapper => {
            const containerId = wrapper.dataset.containerId;
            if (containerId) {
                const container = document.getElementById(containerId);
                if (!container || !document.body.contains(container)) {
                    if (wrapper.parentElement) {
                        wrapper.parentElement.removeChild(wrapper);
                    }
                }
            } else if (wrapper.parentElement) {
                wrapper.parentElement.removeChild(wrapper);
            }
        });
    };

    // Function to process new elements
    const processNewElement = (element) => {
        if (element.classList && element.classList.contains('GifPreviewV2')) {
            addDownloadButtonIfNeeded(element);
        } else {
            const gifPreview = element.closest('.GifPreviewV2');
            if (gifPreview) {
                addDownloadButtonIfNeeded(gifPreview);
            } else if (element.classList && (element.classList.contains('TapTracker') || element.classList.contains('PlayerV2'))) {
                addDownloadButton(element);
            }
        }
    };
    
    // Observer for dynamically loaded videos
    const observer = new MutationObserver((mutations) => {
        let needsCleanup = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Handle removed nodes
                if (mutation.removedNodes.length > 0) {
                    needsCleanup = true;
                }
                
                // Handle added nodes
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Immediately process the node
                            processNewElement(node);
                            
                            // Check for nested elements
                            const elements = node.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2');
                            elements.forEach(processNewElement);
                        }
                    }
                }
            }
        }
        
        if (needsCleanup) {
            cleanupButtonWrappers();
        }
    });

    // Start observing with improved configuration
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'src', 'style']
    });
    
    // Initial check for existing elements
    const elements = document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2');
    elements.forEach(processNewElement);
    
    // Periodic cleanup only (removed position updates)
    setInterval(cleanupButtonWrappers, 5000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FETCH_SEGMENT') {
        fetchSegmentAndRespond(message.segmentId, message.url, message.byteRange);
    } else if (message.type === 'PROGRESS_UPDATE') {
    } else if (message.type === 'PROCESS_DOWNLOAD') {
    } else if (message.type === 'DOWNLOAD_ERROR') {
    }
});

// Fetch segment and respond to background
async function fetchSegmentAndRespond(segmentId, url, byteRange) {
    try {
        // Use XHR instead of fetch to avoid CORS issues
            const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            
            if (byteRange) {
                const start = byteRange.offset;
                const end = start + byteRange.length - 1;
                xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
            }
            
        xhr.withCredentials = true; // Important for CORS with credentials
        
        // Create a promise to handle the XHR request
        const buffer = await new Promise((resolve, reject) => {
            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 206) {
                    resolve(xhr.response);
                } else {
                    reject(new Error(`HTTP error! status: ${xhr.status}`));
                }
            };
            
            xhr.onerror = function() {
                reject(new Error('Network error fetching segment'));
            };
            
            xhr.ontimeout = function() {
                reject(new Error('Timeout fetching segment'));
            };
            
            xhr.timeout = 30000; // 30 second timeout
            xhr.send();
        });
        
        const base64Data = arrayBufferToBase64(buffer);
        
        chrome.runtime.sendMessage({
            type: 'SEGMENT_DATA',
            segmentId: segmentId,
            data: base64Data
        });
            } catch (error) {
        chrome.runtime.sendMessage({
            type: 'SEGMENT_ERROR',
            segmentId: segmentId,
            error: error.message
        });
    }
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Convert base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: mimeType });
}