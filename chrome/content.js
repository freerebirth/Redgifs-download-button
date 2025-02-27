// Track processed players to prevent duplicate buttons
const processedPlayers = new WeakSet();

// Create and add download button
async function addDownloadButton(container) {
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'redgifs-download-btn';
    downloadBtn.innerHTML = '⬇️ Download';
        
    downloadBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 70px;
        z-index: 100000;
        padding: 8px 16px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: 0.3s;
        display: flex;
        align-items: center;
        gap: 6px;
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

    downloadBtn.addEventListener('click', handleDownload);

    // Insert the button in the TapTracker
    const tapTracker = container.closest('.TapTracker');
    if (tapTracker) {
        tapTracker.appendChild(downloadBtn);
    } else {
        container.appendChild(downloadBtn);
    }
}

// Handle download button click
async function handleDownload(event) {
    const btn = event.target;
    const container = btn.closest('.GifPreviewV2');
    if (!container) return;

    const videoId = getVideoIdFromContainer(container);
    if (!videoId) return;

    btn.innerHTML = '⏳ Converting...';
    btn.style.pointerEvents = 'none';

    try {
        const apiUrl = `https://api.redgifs.com/v2/gifs/${videoId}/hd.m3u8`;
        const manifest = await fetchM3u8(apiUrl);
        await processWithWorker(videoId, manifest, btn);
    } catch (error) {
        console.error('Download error:', error);
        btn.innerHTML = '❌ Error';
        setTimeout(() => {
            btn.innerHTML = '⬇️ Download';
            btn.style.pointerEvents = 'auto';
        }, 2000);
    }
}

// Get video ID from container
function getVideoIdFromContainer(container) {
    // Try from GifPreviewV2 ID first
    if (container && container.id) {
        const gifIdMatch = container.id.match(/gif_(.+)/);
        if (gifIdMatch) return gifIdMatch[1];
    }

    // Try from video source
    const video = container.querySelector('.PlayerV2-Video video');
    if (video && video.src) {
        const patterns = [
            /\/gifs\/([^\/]+)\/hd/,
            /\/gifs\/([^\/]+)/,
            /\/([^\/]+)-mobile/,
            /\/([^\/]+)\.m4s/,
            /\/([^\/]+)\.mp4/,
            /\/([^\/]+)\?/
        ];

        for (const pattern of patterns) {
            const match = video.src.match(pattern);
            if (match) return match[1];
        }
    }

    // Try URL for single video page
    if (window.location.pathname.includes('/watch/')) {
        const urlMatch = window.location.pathname.match(/\/watch\/([^\/]+)/);
        if (urlMatch) return urlMatch[1];
    }

    return null;
}

// Process video with Web Worker
async function processWithWorker(videoId, manifest, btn) {
    return new Promise((resolve, reject) => {
        try {
            const workerBlob = new Blob([
                `importScripts('${chrome.runtime.getURL('mp4worker.js')}');`
            ], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(workerBlob);
            const worker = new Worker(workerUrl);
            
            worker.onerror = (error) => {
                reject(error);
                cleanupWorker(worker);
                URL.revokeObjectURL(workerUrl);
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
                        cleanupWorker(worker);
                        URL.revokeObjectURL(workerUrl);
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
                        cleanupWorker(worker);
                        URL.revokeObjectURL(workerUrl);
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

// Clean up worker resources
function cleanupWorker(worker) {
    if (worker) {
        worker.terminate();
        if (worker.url) {
            URL.revokeObjectURL(worker.url);
        }
    }
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

// Fetch m3u8 content
function fetchM3u8(url) {
    return new Promise((resolve, reject) => {
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

// Check if download button should be added
function addDownloadButtonIfNeeded(container) {
    if (!container || !container.id || processedPlayers.has(container)) {
        return;
    }

    // Find the PlayerV2 within the TapTracker
    const tapTracker = container.querySelector('.TapTracker');
    if (!tapTracker) {
        return;
    }

    const playerV2 = tapTracker.querySelector('.PlayerV2');
    if (!playerV2) {
        return;
    }

    // Check if button already exists in TapTracker
    const existingBtn = tapTracker.querySelector('.redgifs-download-btn');
    if (existingBtn) {
        return;
    }

    processedPlayers.add(container);
    addDownloadButton(playerV2);
}

// Initialize mutation observers
function initObservers() {
    // Observer for dynamically loaded videos
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Check if we need to re-add buttons that might have been removed
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                const gifPreviews = document.querySelectorAll('.GifPreviewV2');
                gifPreviews.forEach(preview => {
                    const tapTracker = preview.querySelector('.TapTracker');
                    if (tapTracker && !tapTracker.querySelector('.redgifs-download-btn')) {
                        processedPlayers.delete(preview);
                        setTimeout(() => addDownloadButtonIfNeeded(preview), 100);
                    }
                });
            }

            // Check for new nodes
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList.contains('GifPreviewV2')) {
                        setTimeout(() => addDownloadButtonIfNeeded(node), 100);
                    }
                    const players = node.querySelectorAll('.GifPreviewV2');
                    players.forEach(player => {
                        setTimeout(() => addDownloadButtonIfNeeded(player), 100);
                    });
                }
            }
        }
    });

    // Start observing with more specific config
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    // Check for existing videos
    const existingPlayers = document.querySelectorAll('.GifPreviewV2');
    existingPlayers.forEach(player => {
        setTimeout(() => addDownloadButtonIfNeeded(player), 100);
    });

    // Periodically check for videos that might have lost their buttons
    setInterval(() => {
        const gifPreviews = document.querySelectorAll('.GifPreviewV2');
        gifPreviews.forEach(preview => {
            const tapTracker = preview.querySelector('.TapTracker');
            if (tapTracker && !tapTracker.querySelector('.redgifs-download-btn')) {
                processedPlayers.delete(preview);
                addDownloadButtonIfNeeded(preview);
            }
        });
    }, 1000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObservers);
} else {
    initObservers();
}