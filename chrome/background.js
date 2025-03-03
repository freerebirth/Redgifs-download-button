// Track pending segment requests
const pendingSegments = new Map();

// Debug helper
function debug(message, data = null) {
    console.log(`[RedgifsDownloader Debug] ${message}`, data || '');
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debug(`Received message: ${message.type}`);
    
    if (message.type === 'SHOW_POPUP') {
        chrome.action.openPopup();
    } else if (message.type === 'PROCESS_VIDEO') {
        debug(`Starting video processing for ID: ${message.videoId}`);
        handleVideoProcessing(message.videoId, message.manifest, sender.tab.id);
    } else if (message.type === 'SEGMENT_DATA') {
        debug(`Received segment data for ID: ${message.segmentId}, size: ${message.data.length} bytes`);
        handleSegmentData(message.segmentId, message.data);
    } else if (message.type === 'SEGMENT_ERROR') {
        debug(`Received segment error for ID: ${message.segmentId}: ${message.error}`);
        handleSegmentError(message.segmentId, message.error);
    } else if (message.type === 'DOWNLOAD_DIRECT') {
        return handleDirectDownload(message.url, message.filename, sendResponse);
    }
    
    // Return false to indicate we won't send a response asynchronously
    return false;
});

// Handle direct download
function handleDirectDownload(url, filename, sendResponse) {
    debug(`Starting direct download from URL: ${url}`);
    
    // Use the chrome.downloads API to download the file
    chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            debug(`Download error: ${chrome.runtime.lastError.message}`);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            debug(`Download started with ID: ${downloadId}`);
            sendResponse({ success: true, downloadId: downloadId });
        }
    });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
}

// Parse m3u8 manifest
function parseM3u8(manifest) {
    debug('Parsing m3u8 manifest');
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
                debug('Found init segment:', initSegment);
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
    
    debug(`Parsed manifest: found ${segments.length} segments${initSegment ? ' and init segment' : ''}`);
    return { initSegment, segments };
}

// Fetch segment with byte range
async function fetchSegment(segment, headers = {}) {
    debug(`Fetching segment: ${segment.url}`);
    const headersToUse = new Headers(headers);
    if (segment.byteRange) {
        const start = segment.byteRange.offset;
        const end = start + segment.byteRange.length - 1;
        headersToUse.append('Range', `bytes=${start}-${end}`);
        debug(`Using byte range: ${start}-${end}`);
    }
    
    try {
        const response = await fetch(segment.url, { 
            headers: headersToUse,
            mode: 'cors',
            credentials: 'include'
        });

        if (!response.ok) {
            debug(`Segment fetch failed with status: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        debug(`Segment fetch successful, size: ${buffer.byteLength} bytes`);
        return buffer;
    } catch (error) {
        debug(`Segment fetch error: ${error.message}`);
        throw error;
    }
}

// Enhanced fetch with retry and detailed error handling
async function enhancedFetch(url, options = {}, retries = 3) {
    debug(`Enhanced fetch for URL: ${url}, retries: ${retries}`);
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            debug(`Fetch attempt ${i+1}/${retries}`);
            const response = await fetch(url, {
                ...options,
                credentials: 'include',
                mode: 'cors'
            });

            if (!response.ok) {
                debug(`Fetch failed with status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            debug('Fetch successful');
            return response;
        } catch (error) {
            lastError = error;
            debug(`Fetch attempt ${i+1} failed: ${error.message}`);
            
            if (i < retries - 1) {
                const delay = 1000 * (i + 1);
                debug(`Retrying in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    debug(`All fetch attempts failed: ${lastError.message}`);
    throw lastError;
}

// MP4 Processing Class
class MP4Processor {
    constructor() {
        this.initSegment = null;
        this.mediaSegments = [];
        this.moovBox = null;
        this.totalSegments = 0;
        this.processedSegments = 0;
    }

    processInitSegment(data) {
        this.initSegment = data;
        this.moovBox = this.findBox(data, 'moov');
    }

    processSegment(data) {
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
        
        this.processedSegments++;
        return (this.processedSegments / this.totalSegments) * 100;
    }

    finalize() {
        const chunks = [this.initSegment];
        chunks.push(...this.mediaSegments);
        
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalSize);
        let offset = 0;
        
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        // Clear memory
        this.initSegment = null;
        this.mediaSegments = [];
        this.moovBox = null;
        
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

// Handle video processing
async function handleVideoProcessing(videoId, manifest, tabId) {
    debug(`Processing video: ${videoId}`);
    try {
        const processor = new MP4Processor();
        let processedSegments = 0;
        
        const { initSegment, segments } = parseM3u8(manifest);
        if (!segments || segments.length === 0) {
            debug('No segments found in manifest');
            throw new Error('No segments found in manifest');
        }

        debug(`Starting processing with ${segments.length} segments`);
        processor.totalSegments = segments.length;

        if (initSegment) {
            debug('Processing init segment');
            const initData = await requestSegment(tabId, initSegment);
            debug(`Init segment data received, size: ${initData.byteLength} bytes`);
            processor.processInitSegment(new Uint8Array(initData));
        }

        let downloadedSize = 0;
        for (let i = 0; i < segments.length; i++) {
            debug(`Requesting segment ${i+1}/${segments.length}`);
            const segmentData = await requestSegment(tabId, segments[i]);
            downloadedSize += segmentData.byteLength;
            debug(`Segment ${i+1} data received, size: ${segmentData.byteLength} bytes`);
            
            const progress = processor.processSegment(new Uint8Array(segmentData));
            debug(`Segment processed: ${i+1}/${segments.length} (${progress.toFixed(2)}%)`);
            
            chrome.tabs.sendMessage(tabId, {
                type: 'PROGRESS_UPDATE',
                progress: progress
            });
        }

        debug('All segments processed, finalizing');
        const finalResult = processor.finalize();
        debug(`Final video size: ${finalResult.byteLength} bytes`);
        
        const blob = new Blob([finalResult], { type: 'video/mp4' });
        const reader = new FileReader();
        
        reader.onload = function() {
            const base64Data = reader.result.split(',')[1];
            debug(`Sending processed download to tab, data size: ${base64Data.length} bytes`);
            chrome.tabs.sendMessage(tabId, {
                type: 'PROCESS_DOWNLOAD',
                videoId: videoId,
                data: base64Data,
                mimeType: 'video/mp4'
            });
        };
        
        reader.readAsDataURL(blob);

    } catch (error) {
        debug(`Video processing error: ${error.message}`);
        chrome.tabs.sendMessage(tabId, { 
            type: 'DOWNLOAD_ERROR', 
            error: error.message 
        });
    }
}

// Request segment from content script
function requestSegment(tabId, segment) {
    debug(`Requesting segment from content script: ${segment.url}`);
    return new Promise((resolve, reject) => {
        const segmentId = Math.random().toString(36).substring(7);
        debug(`Generated segment ID: ${segmentId}`);
        
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
    debug(`Handling segment data for ID: ${segmentId}`);
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        debug(`Found pending segment request for ID: ${segmentId}`);
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        debug(`Converted base64 to ArrayBuffer, size: ${arrayBuffer.byteLength} bytes`);
        pending.resolve(arrayBuffer);
        pendingSegments.delete(segmentId);
    } else {
        debug(`No pending segment request found for ID: ${segmentId}`);
    }
}

// Handle segment error
function handleSegmentError(segmentId, error) {
    debug(`Handling segment error for ID: ${segmentId}: ${error}`);
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        pending.reject(new Error(error));
        pendingSegments.delete(segmentId);
    }
}

// Helper function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    debug(`Converting base64 to ArrayBuffer, length: ${base64.length}`);
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
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

// Log when the background script is loaded
debug('Background script loaded'); 