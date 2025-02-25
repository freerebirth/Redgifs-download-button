// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_POPUP') {
        chrome.action.openPopup();
    } else if (message.type === 'PROCESS_VIDEO') {
        handleVideoProcessing(message.videoId, message.manifest, sender.tab.id);
    } else if (message.type === 'SEGMENT_DATA') {
        handleSegmentData(message.segmentId, message.data);
    } else if (message.type === 'SEGMENT_ERROR') {
        handleSegmentError(message.segmentId, message.error);
    } else if (message.type === 'OPEN_PAYMENT_WINDOW') {
        chrome.windows.create({
            url: chrome.runtime.getURL('payment.html'),
            type: 'popup',
            width: 500,
            height: 600,
            focused: true
        });
    }
});

// Parse m3u8 manifest
function parseM3u8(manifest) {
    const lines = manifest.split('\n');
    const segments = [];
    let initSegment = null;
    let currentSegment = null;
    
    for (let line of lines) {
        line = line.trim();
        
        if (line.startsWith('#EXT-X-MAP:')) {
            const uriMatch = line.match(/URI="([^"]+)"/);
            const byteRangeMatch = line.match(/BYTERANGE="([^"]+)"/);
            if (uriMatch && byteRangeMatch) {
                const [offset, length] = byteRangeMatch[1].split('@').reverse();
                initSegment = {
                    url: uriMatch[1],
                    byteRange: {
                        offset: parseInt(offset),
                        length: parseInt(length)
                    }
                };
            }
        }
        else if (line.startsWith('#EXTINF:')) {
            currentSegment = {
                duration: parseFloat(line.split(':')[1])
            };
        }
        else if (line.startsWith('#EXT-X-BYTERANGE:')) {
            const [length, offset] = line.split(':')[1].split('@');
            if (currentSegment) {
                currentSegment.byteRange = {
                    offset: parseInt(offset || '0'),
                    length: parseInt(length)
                };
            }
        }
        else if (!line.startsWith('#') && line.length > 0 && currentSegment) {
            currentSegment.url = line;
            segments.push(currentSegment);
            currentSegment = null;
        }
    }
    
    return { initSegment, segments };
}

// Fetch segment with byte range
async function fetchSegment(segment, headers = {}) {
    const headersToUse = new Headers(headers);
    if (segment.byteRange) {
        const start = segment.byteRange.offset;
        const end = start + segment.byteRange.length - 1;
        headersToUse.append('Range', `bytes=${start}-${end}`);
    }
    
    const response = await fetch(segment.url, { 
        headers: headersToUse,
        mode: 'cors',
        credentials: 'include'
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.arrayBuffer();
}

// Enhanced fetch with retry and detailed error handling
async function enhancedFetch(url, options = {}, retries = 3) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                credentials: 'include',
                mode: 'cors'
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Access forbidden - Authentication required');
                } else if (response.status === 401) {
                    throw new Error('Unauthorized - Invalid or expired token');
                }
                
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            lastError = error;
            
            if (error.message.includes('Authentication required') ||
                error.message.includes('Invalid or expired token')) {
                throw error;
            }
            
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    
    throw lastError;
}

// Handle video processing
async function handleVideoProcessing(videoId, manifest, tabId) {
    try {
        const worker = new Worker('mp4worker.js');
        let processedSegments = 0;
        
        const { initSegment, segments } = parseM3u8(manifest);
        if (!segments || segments.length === 0) {
            throw new Error('No segments found in manifest');
        }

        worker.onmessage = function(e) {
            const { type, data, progress } = e.data;
            
            switch(type) {
                case 'SEGMENT_PROCESSED':
                    processedSegments++;
                    chrome.tabs.sendMessage(tabId, {
                        type: 'PROGRESS_UPDATE',
                        progress: (processedSegments / segments.length) * 100
                    });
                    break;
                    
                case 'FINALIZED':
                    const blob = new Blob([data], { type: 'video/mp4' });
                    const reader = new FileReader();
                    
                    reader.onload = function() {
                        const base64Data = reader.result.split(',')[1];
                        chrome.tabs.sendMessage(tabId, {
                            type: 'PROCESS_DOWNLOAD',
                            videoId: videoId,
                            data: base64Data,
                            mimeType: 'video/mp4'
                        });
                    };
                    
                    reader.readAsDataURL(blob);
                    worker.terminate();
                    break;
                    
                case 'ERROR':
                    throw new Error(e.data.error);
            }
        };

        if (initSegment) {
            const initData = await requestSegment(tabId, initSegment);
            worker.postMessage({
                type: 'INIT_SEGMENT',
                data: initData
            }, [initData]);
        }

        let downloadedSize = 0;
        for (let i = 0; i < segments.length; i++) {
            const segmentData = await requestSegment(tabId, segments[i]);
            downloadedSize += segmentData.byteLength;
            
            worker.postMessage({
                type: 'PROCESS_SEGMENT',
                data: segmentData,
                processedSize: downloadedSize,
                totalSize: segments.length * (downloadedSize / (i + 1))
            }, [segmentData]);
        }

        worker.postMessage({ type: 'FINALIZE' });

    } catch (error) {
        chrome.tabs.sendMessage(tabId, { 
            type: 'DOWNLOAD_ERROR', 
            error: error.message 
        });
    }
}

// Request segment from content script
function requestSegment(tabId, segment) {
    return new Promise((resolve, reject) => {
        const segmentId = Math.random().toString(36).substring(7);
        
        // Set up handlers for this segment
        pendingSegments.set(segmentId, { resolve, reject });
        
        // Request the segment from content script
        chrome.tabs.sendMessage(tabId, {
            type: 'FETCH_SEGMENT',
            segmentId: segmentId,
            url: segment.url,
            byteRange: segment.byteRange
        });
    });
}

// Handle received segment data
function handleSegmentData(segmentId, base64Data) {
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        pending.resolve(arrayBuffer);
        pendingSegments.delete(segmentId);
    }
}

// Handle segment error
function handleSegmentError(segmentId, error) {
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        pending.reject(new Error(error));
        pendingSegments.delete(segmentId);
    }
}

// Helper function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// MP4 Processing Class
class MP4Processor {
    constructor() {
        this.initSegment = null;
        this.mediaSegments = [];
        this.moovBox = null;
    }

    processInitSegment(data) {
        this.initSegment = data;
        // Extract moov box from init segment for later use
        this.moovBox = this.findBox(data, 'moov');
    }

    processSegment(data) {
        // Remove the ftype and moov boxes if present (they should only be in init segment)
        let start = 0;
        while (start < data.length) {
            const size = this.readUint32(data, start);
            const type = this.getBoxType(data, start + 4);
            if (type === 'ftyp' || type === 'moov') {
                start += size;
            } else {
                break;
            }
        }
        
        if (start < data.length) {
            this.mediaSegments.push(data.slice(start));
        }
    }

    finalize() {
        // Combine all segments
        const chunks = [this.initSegment];
        chunks.push(...this.mediaSegments);
        
        // Calculate total size
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        
        // Create final buffer
        const result = new Uint8Array(totalSize);
        let offset = 0;
        
        // Copy all chunks
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        return result;
    }

    findBox(data, type) {
        let start = 0;
        while (start < data.length) {
            const size = this.readUint32(data, start);
            const boxType = this.getBoxType(data, start + 4);
            if (boxType === type) {
                return data.slice(start, start + size);
            }
            start += size;
        }
        return null;
    }

    readUint32(data, offset) {
        return data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3];
    }

    getBoxType(data, offset) {
        return String.fromCharCode(...data.slice(offset, offset + 4));
    }
}

// Listen for network requests to capture m3u8 and segments
chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        const url = details.url;
        if (url.includes('.m3u8')) {
        }
    },
    { urls: ["*://*.redgifs.com/*"] }
);

// Extract video ID from URL
function getVideoIdFromUrl(url) {
    // Extract ID from various URL patterns
    const patterns = [
        /\/([^\/]+)-mobile\.m4s/,
        /\/([^\/]+)-mobile\.m3u8/,
        /\/watch\/([^\/]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1].toLowerCase();
    }
    
    return null;
}

// Clean up old data periodically
setInterval(() => {
}, 3600000); // Check every hour 