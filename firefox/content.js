// Track processed players to prevent duplicate buttons
const processedPlayers = new WeakSet();

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
    
    // Create container for our button outside the video structure
    const buttonContainer = document.createElement('div');
    
    // Get container position for proper button placement
    const containerRect = container.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    
    // Calculate absolute position
    const topPos = containerRect.top + scrollTop;
    const leftPos = containerRect.left + scrollLeft;
    
    // Create button wrapper
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'redgifs-download-btn-wrapper';
    buttonWrapper.dataset.containerId = container.id;
    
    // Create the button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'redgifs-download-btn';
    downloadBtn.innerHTML = '⬇️ Download';
    
    // Add event listeners
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
    
    // Add button to wrapper
    buttonWrapper.appendChild(downloadBtn);
    
    // Directly add the button to the container
    // This approach should not affect opacity as we're not manipulating the container
    container.appendChild(buttonWrapper);
    
    // Store references for cleanup
    if (!container.redgifsDownloaderData) {
        container.redgifsDownloaderData = {};
    }
    container.redgifsDownloaderData.buttonWrapper = buttonWrapper;
    
    // Force Firefox to update the display
    setTimeout(() => {
        downloadBtn.style.display = 'flex';
    }, 0);
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
        browser.runtime.sendMessage({
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

// Fallback download method
async function tryFallbackDownload(videoId, btn) {
    try {
        // Construct the direct m4s URL
        const capitalizedId = videoId.charAt(0).toUpperCase() + videoId.slice(1);
        const directUrl = `https://media.redgifs.com/${capitalizedId}.m4s`;
        
        // Use downloads API to download the file directly
        browser.runtime.sendMessage({
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

// Fetch m3u8 content
async function fetchM3u8(url) {
    try {
        // Use XHR instead of fetch to avoid CORS issues
        const text = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            
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
            
            xhr.send();
        });
        
        return text;
    } catch (error) {
        throw error;
    }
}

// Get video ID from container
function getVideoIdFromContainer(container) {
    // Helper function to find GifPreviewV2 parent
    const findGifPreviewParent = (element) => {
        if (!element) return null;
        if (element.classList && element.classList.contains('GifPreviewV2')) {
            return element;
        }
        return element.closest('.GifPreviewV2');
    };
    
    if (!container.classList || !container.classList.contains('GifPreviewV2')) {
        const gifPreview = findGifPreviewParent(container);
        if (gifPreview) {
            container = gifPreview;
        }
    }
    
    // Try to get ID from container ID (most reliable)
    if (container.id && container.id.startsWith('gif_')) {
        const id = container.id.replace('gif_', '');
        return id;
    }
    
    // Try to get ID from video poster attribute
    const video = container.querySelector('video');
    if (video && video.poster) {
        const posterMatch = video.poster.match(/\/([^\/]+)-mobile\.jpg$/);
        if (posterMatch && posterMatch[1]) {
            return posterMatch[1];
        }
    }
    
    // Try to get ID from URL
    if (window.location.pathname.includes('/watch/')) {
        const urlMatch = window.location.pathname.match(/\/watch\/([^\/]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
    }
    
    // Try to get ID from meta tags
    const metaTags = document.querySelectorAll('meta[property="og:video"]');
    for (const meta of metaTags) {
        const content = meta.getAttribute('content');
        if (content) {
            const metaMatch = content.match(/\/([^\/]+)(?:\/hd|$)/);
            if (metaMatch && metaMatch[1]) {
                return metaMatch[1];
            }
        }
    }
    
    // Try to get ID from data attributes
    const elements = [container, ...container.querySelectorAll('[data-id], [data-gif-id]')];
    for (const el of elements) {
        if (!el) continue;
        const dataId = el.getAttribute('data-id') || el.getAttribute('data-gif-id');
        if (dataId) {
            return dataId;
        }
    }
    
    // Try to get ID from img alt
    const imgs = container.querySelectorAll('img[alt]');
    for (const img of imgs) {
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

// Process video with Web Worker
async function processWithWorker(videoId, manifest, btn) {
    return new Promise((resolve, reject) => {
        try {
            const worker = new Worker(browser.runtime.getURL('mp4worker.js'));
            
            worker.onerror = (error) => {
                reject(error);
                worker.terminate();
            };

            worker.onmessage = async (e) => {
                const { type, data, progress } = e.data;
                
                switch(type) {
                    case 'PROGRESS':
                        if (btn) {
                            btn.innerHTML = `⏳ ${Math.round(progress)}%`;
                        }
                        break;

                    case 'NEED_SEGMENT':
                        try {
                            if (btn) {
                                btn.innerHTML = `⏳ Fetching segment...`;
                            }
                            const segmentData = await fetchSegment(data.url, data.byteRange);
                            worker.postMessage({
                                type: 'SEGMENT_DATA',
                                data: segmentData
                            }, [segmentData]);
                        } catch (error) {
                            worker.postMessage({
                                type: 'SEGMENT_ERROR',
                                error: error.message
                            });
                        }
                        break;

                    case 'COMPLETE':
                        const blob = new Blob([data], { type: 'video/mp4' });
                        downloadFile(blob, `redgifs_${videoId}.mp4`, btn);
                        worker.terminate();
                        resolve();
                        break;

                    case 'ERROR':
                        if (btn) {
                            btn.innerHTML = '❌ Error';
                            setTimeout(() => {
                                btn.innerHTML = '⬇️ Download';
                                btn.style.pointerEvents = 'auto';
                            }, 2000);
                        }
                        reject(new Error(data?.error || 'Unknown error'));
                        worker.terminate();
                        break;
                }
            };

            worker.postMessage({
                type: 'START_PROCESSING',
                videoId: videoId,
                manifest: manifest
            });

        } catch (error) {
            reject(error);
        }
    });
}

// Download file helper
function downloadFile(blob, filename, btn) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    
    if (btn) {
        btn.innerHTML = '⬇️ Downloading...';
    }
    
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
        if (btn) {
            btn.innerHTML = '✅ Done';
            setTimeout(() => {
                btn.innerHTML = '⬇️ Download';
            }, 2000);
        }
        URL.revokeObjectURL(url);
    }, 1000);
}

// Fetch segment with retry
function fetchSegment(segmentUrl, byteRange = null) {
    const segmentKey = `${segmentUrl}${byteRange ? `_${byteRange.offset}_${byteRange.length}` : ''}`;
    
    return retryManager.execute(segmentKey, () => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', segmentUrl, true);
            xhr.responseType = 'arraybuffer';
            
            if (byteRange) {
                const start = byteRange.offset;
                const end = start + byteRange.length - 1;
                xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
            }
            
            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 206) {
                    retryManager.clearAttempts(segmentKey);
                    resolve(xhr.response);
                } else {
                    reject(new Error(`Failed to fetch segment: ${xhr.status}`));
                }
            };
            
            xhr.onerror = function() {
                reject(new Error('Network error fetching segment'));
            };
            
            xhr.timeout = 10000;
            xhr.send();
        });
    });
}

// Retry Manager
class RetryManager {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
        this.attempts = new Map();
    }

    async execute(key, operation) {
        let attempt = this.attempts.get(key) || 0;
        
        while (attempt < this.maxRetries) {
            try {
                return await operation();
            } catch (error) {
                attempt++;
                this.attempts.set(key, attempt);
                
                if (attempt === this.maxRetries) {
                    throw new Error(`Failed after ${this.maxRetries} attempts: ${error.message}`);
                }

                const jitter = Math.random() * 0.25 + 0.75;
                const delay = this.baseDelay * Math.pow(2, attempt - 1) * jitter;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    clearAttempts(key) {
        this.attempts.delete(key);
    }
}

const retryManager = new RetryManager();

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
        // For direct video containers or players
        if (element.classList && (
            element.classList.contains('TapTracker') || 
            element.classList.contains('PlayerV2') || 
            element.querySelector('video')
        )) {
            addDownloadButton(element);
            return;
        }
        
        // For GifPreviewV2 containers
        if (element.classList && element.classList.contains('GifPreviewV2')) {
            const player = element.querySelector('.TapTracker, .PlayerV2');
            if (player) {
                addDownloadButton(player);
            } else {
                // If no player found within GifPreviewV2, try to add button to the container itself
                addDownloadButton(element);
            }
            return;
        }
        
        // For any element that might contain players
        const players = element.querySelectorAll('.TapTracker, .PlayerV2');
        if (players.length > 0) {
            players.forEach(player => addDownloadButton(player));
            return;
        }
        
        // Check for video elements directly
        const videos = element.querySelectorAll('video');
        if (videos.length > 0) {
            videos.forEach(video => {
                const playerContainer = video.closest('.TapTracker, .PlayerV2');
                if (playerContainer) {
                    addDownloadButton(playerContainer);
                } else {
                    // If video doesn't have a proper container, add button to its parent
                    addDownloadButton(video.parentElement);
                }
            });
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
                            
                            // Check for nested elements that might be players
                            const elements = node.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video');
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
    
    // Initial check for existing elements - be thorough!
    document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video').forEach(processNewElement);
    
    // Periodic check for missing buttons
    setInterval(() => {
        cleanupButtonWrappers();
        
        // Check for any videos that might not have buttons
        document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video').forEach(element => {
            // Only add button if none exists for this container
            if (element.id) {
                const wrappers = document.querySelectorAll('.redgifs-download-btn-wrapper');
                let hasButton = false;
                for (const wrapper of wrappers) {
                    if (wrapper.dataset.containerId === element.id) {
                        hasButton = true;
                        break;
                    }
                }
                
                if (!hasButton) {
                    processNewElement(element);
                }
            } else {
                // If no ID, check if the element or parents already have a button
                const existing = element.querySelector('.redgifs-download-btn') || 
                                element.closest('.TapTracker, .PlayerV2, .GifPreviewV2')?.querySelector('.redgifs-download-btn');
                if (!existing) {
                    processNewElement(element);
                }
            }
        });
    }, 2000);
}

// Process container to add download button
function processContainer(container) {
    // Generate unique ID if needed
    if (!container.id) {
        container.id = 'redgifs-container-' + Math.random().toString(36).substring(7);
    }

    // Check if already processed
    if (processedPlayers.has(container)) {
        return;
    }

    // Check if button already exists
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
        
        // Immediate scan for videos after DOM is ready
        setTimeout(() => {
            console.log('[RedgifsDownloader] Initial scan for videos');
            document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video').forEach(element => {
                const processNewElement = (el) => {
                    if (el.classList && (el.classList.contains('TapTracker') || el.classList.contains('PlayerV2'))) {
                        addDownloadButton(el);
                    } else if (el.classList && el.classList.contains('GifPreviewV2')) {
                        const player = el.querySelector('.TapTracker, .PlayerV2');
                        if (player) {
                            addDownloadButton(player);
                        } else {
                            addDownloadButton(el);
                        }
                    } else if (el.tagName === 'VIDEO') {
                        const playerContainer = el.closest('.TapTracker, .PlayerV2');
                        if (playerContainer) {
                            addDownloadButton(playerContainer);
                        } else {
                            addDownloadButton(el.parentElement);
                        }
                    }
                };
                
                processNewElement(element);
            });
        }, 1000);
    });
} else {
    initObservers();
    initializePositionUpdates();
    
    // Immediate scan for videos if DOM is already loaded
    setTimeout(() => {
        console.log('[RedgifsDownloader] Initial scan for videos');
        document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video').forEach(element => {
            const processNewElement = (el) => {
                if (el.classList && (el.classList.contains('TapTracker') || el.classList.contains('PlayerV2'))) {
                    addDownloadButton(el);
                } else if (el.classList && el.classList.contains('GifPreviewV2')) {
                    const player = el.querySelector('.TapTracker, .PlayerV2');
                    if (player) {
                        addDownloadButton(player);
                    } else {
                        addDownloadButton(el);
                    }
                } else if (el.tagName === 'VIDEO') {
                    const playerContainer = el.closest('.TapTracker, .PlayerV2');
                    if (playerContainer) {
                        addDownloadButton(playerContainer);
                    } else {
                        addDownloadButton(el.parentElement);
                    }
                }
            };
            
            processNewElement(element);
        });
    }, 1000);
}

// Add a completely isolated style that won't affect any other elements
const style = document.createElement('style');
style.textContent = `
/* Isolate our styles from affecting video opacity */
@keyframes redgifs-appear {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* Make button container completely isolated */
.redgifs-download-btn-wrapper {
    position: absolute !important;
    top: 0 !important;
    right: 0 !important;
    width: 80px !important;
    height: 40px !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    display: block !important;
    background-color: transparent !important;
    mix-blend-mode: normal !important;
    border: none !important;
    animation: redgifs-appear 0.3s ease forwards !important;
}

/* Style the button while ensuring it doesn't affect others */
.redgifs-download-btn {
    all: initial !important;
    position: absolute !important;
    top: 10px !important;
    right: 10px !important;
    z-index: 2147483647 !important;
    padding: 4px 10px !important;
    background: rgba(0, 0, 0, 0.7) !important;
    color: white !important;
    border: none !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    font-size: 12px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    pointer-events: auto !important;
    box-shadow: none !important;
    text-transform: none !important;
}

/* Ensure hover effects work */
.redgifs-download-btn:hover {
    background: rgba(0, 0, 0, 0.9) !important;
    transform: scale(1.05) !important;
}
`;
document.head.appendChild(style);

// Also add a style element to fix any unintended opacity issues directly
const fixOpacityStyle = document.createElement('style');
fixOpacityStyle.textContent = `
.PlayerV2, .TapTracker, .GifPreviewV2, video, 
.PlayerV2 video, .TapTracker video, .GifPreviewV2 video {
    opacity: 1 !important;
}
`;
document.head.appendChild(fixOpacityStyle);

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FETCH_SEGMENT') {
        fetchSegmentAndRespond(message.segmentId, message.url, message.byteRange);
    } else if (message.type === 'PROGRESS_UPDATE') {
        // Progress update received
    } else if (message.type === 'PROCESS_DOWNLOAD') {
        // Download being processed
    } else if (message.type === 'DOWNLOAD_ERROR') {
        // Download error
    }
});

// Fetch segment and respond to background
async function fetchSegmentAndRespond(segmentId, url, byteRange) {
    try {
        // Use XHR instead of fetch to avoid CORS issues
        const buffer = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = 'arraybuffer';
            xhr.open('GET', url, true);
            
            if (byteRange) {
                const start = byteRange.start || 0;
                const end = start + byteRange.length - 1;
                xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
            }
            
            xhr.timeout = 10000; // 10 seconds timeout
            
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
            
            xhr.send();
        });
        
        const base64Data = arrayBufferToBase64(buffer);
        
        browser.runtime.sendMessage({
            type: 'SEGMENT_DATA',
            segmentId: segmentId,
            data: base64Data
        });
    } catch (error) {
        browser.runtime.sendMessage({
            type: 'SEGMENT_ERROR',
            segmentId: segmentId,
            error: error.message
        });
    }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Convert base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: mimeType });
} 