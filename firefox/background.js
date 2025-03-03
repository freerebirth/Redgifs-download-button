// Firefox background script
const isDesktopFirefox = browser.runtime.getPlatformInfo().then(info => info.os !== 'android');

// Track pending segment requests
const pendingSegmentRequests = new Map();

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_DIRECT') {
        // Direct download request
        const { url, filename } = message;
        
        browser.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }).then((downloadId) => {
            sendResponse({ success: true, downloadId });
        }).catch((error) => {
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // Keep message channel open for async response
    } else if (message.type === 'SEGMENT_DATA') {
        // Handle segment data received from content script
        handleSegmentData(message.segmentId, message.data);
    } else if (message.type === 'SEGMENT_ERROR') {
        // Handle segment error
        handleSegmentError(message.segmentId, message.error);
    } else if (message.type === 'OPEN_PAYMENT_WINDOW') {
        browser.windows.create({
            url: browser.runtime.getURL('payment.html'),
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
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for init segment (EXT-X-MAP)
        if (line.startsWith('#EXT-X-MAP:')) {
            const uriMatch = line.match(/URI="([^"]+)"/);
            if (uriMatch && uriMatch[1]) {
                let byteRange = null;
                const byteRangeMatch = line.match(/BYTERANGE="([^"]+)"/);
                if (byteRangeMatch && byteRangeMatch[1]) {
                    const rangeParts = byteRangeMatch[1].split('@');
                    if (rangeParts.length === 2) {
                        byteRange = {
                            length: parseInt(rangeParts[0], 10),
                            start: parseInt(rangeParts[1], 10)
                        };
                    }
                }
                
                initSegment = {
                    url: uriMatch[1],
                    byteRange
                };
            }
        }
        
        // Look for segment duration
        if (line.startsWith('#EXTINF:')) {
            const durationMatch = line.match(/#EXTINF:([^,]+)/);
            const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
            
            // Next line should be the segment URL
            if (i + 1 < lines.length) {
                const segmentUrl = lines[++i].trim();
                if (!segmentUrl.startsWith('#')) {
                    let byteRange = null;
                    
                    // Check if previous line had byte range
                    if (i > 1 && lines[i-2].startsWith('#EXT-X-BYTERANGE:')) {
                        const rangeInfo = lines[i-2].substring(16).trim();
                        const rangeParts = rangeInfo.split('@');
                        if (rangeParts.length === 2) {
                            byteRange = {
                                length: parseInt(rangeParts[0], 10),
                                start: parseInt(rangeParts[1], 10)
                            };
                        } else if (rangeParts.length === 1) {
                            byteRange = {
                                length: parseInt(rangeParts[0], 10),
                                start: 0
                            };
                        }
                    }
                    
                    segments.push({
                        url: segmentUrl,
                        duration,
                        byteRange
                    });
                }
            }
        }
    }
    
    return { segments, initSegment };
}

// Enhanced fetch with retries
async function enhancedFetch(url, options = {}, retries = 3) {
    let lastError = null;
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            lastError = error;
            
            if (i < retries - 1) {
                // Wait before retrying (exponential backoff)
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('Failed after multiple attempts');
}

// Process video for download
async function processVideo(videoId, manifest) {
    const { segments, initSegment } = parseM3u8(manifest);
    
    if (segments.length === 0) {
        return { success: false, error: 'No segments found in manifest' };
    }
    
    // Create MP4 builder
    let finalResult;
    let totalSegments = segments.length;
    
    try {
        // Process init segment if available
        let initData = null;
        if (initSegment) {
            initData = await fetchSegmentFromContentScript(initSegment);
        }
        
        // Process video segments
        const videoSegments = [];
        for (let i = 0; i < segments.length; i++) {
            const segmentData = await fetchSegmentFromContentScript(segments[i]);
            videoSegments.push(segmentData);
            
            const progress = ((i + 1) / totalSegments) * 100;
            
            // Send progress update to content script
            browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
                if (tabs.length > 0) {
                    browser.tabs.sendMessage(tabs[0].id, { 
                        type: 'PROGRESS_UPDATE',
                        progress 
                    });
                }
            });
        }
        
        // Combine segments into one ArrayBuffer
        const totalSize = videoSegments.reduce((total, segment) => total + segment.byteLength, 0) + 
                          (initData ? initData.byteLength : 0);
        
        finalResult = new Uint8Array(totalSize);
        
        let offset = 0;
        if (initData) {
            finalResult.set(new Uint8Array(initData), offset);
            offset += initData.byteLength;
        }
        
        for (const segment of videoSegments) {
            finalResult.set(new Uint8Array(segment), offset);
            offset += segment.byteLength;
        }
        
        // Send the processed video to content script for download
        const blob = new Blob([finalResult], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        // Start download
        return await new Promise((resolve) => {
            browser.downloads.download({
                url: url,
                filename: `redgifs_${videoId}.mp4`,
                saveAs: false
            }).then((downloadId) => {
                resolve({ success: true, downloadId });
            }).catch((error) => {
                resolve({ success: false, error: error.message });
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fetch segment from content script
async function fetchSegmentFromContentScript(segment) {
    return new Promise((resolve, reject) => {
        const segmentId = Math.random().toString(36).substring(2, 15);
        
        pendingSegmentRequests.set(segmentId, { resolve, reject });
        
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            if (tabs.length > 0) {
                browser.tabs.sendMessage(tabs[0].id, {
                    type: 'FETCH_SEGMENT',
                    segmentId,
                    url: segment.url,
                    byteRange: segment.byteRange
                });
            } else {
                pendingSegmentRequests.delete(segmentId);
                reject(new Error('No active tab found'));
            }
        });
    });
}

// Handle segment data received from content script
function handleSegmentData(segmentId, base64Data) {
    const pendingRequest = pendingSegmentRequests.get(segmentId);
    if (pendingRequest) {
        const arrayBuffer = base64ToArrayBuffer(base64Data);
        pendingSegmentRequests.delete(segmentId);
        pendingRequest.resolve(arrayBuffer);
    }
}

// Handle segment error
function handleSegmentError(segmentId, error) {
    const pendingRequest = pendingSegmentRequests.get(segmentId);
    if (pendingRequest) {
        pendingSegmentRequests.delete(segmentId);
        pendingRequest.reject(new Error(error));
    }
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Listen for webRequest events
browser.webRequest.onBeforeRequest.addListener(
    function(details) {
        const url = details.url;
        if (url.includes('.m3u8')) {
            // Handle m3u8 requests if needed
        }
    },
    { urls: ["*://*.redgifs.com/*"] }
); 