// Firefox background script
const isDesktopFirefox = browser.runtime.getPlatformInfo().then(info => info.os !== 'android');

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROCESS_VIDEO') {
        handleVideoProcessing(message.videoId, message.manifest, sender.tab.id);
    } else if (message.type === 'SEGMENT_DATA') {
        handleSegmentData(message.segmentId, message.data);
    } else if (message.type === 'SEGMENT_ERROR') {
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

// Handle video processing
async function handleVideoProcessing(videoId, manifest, tabId) {
    try {
        const worker = new Worker(browser.runtime.getURL('mp4worker.js'));
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
                    browser.tabs.sendMessage(tabId, {
                        type: 'PROGRESS_UPDATE',
                        progress: (processedSegments / segments.length) * 100
                    });
                    break;
                    
                case 'FINALIZED':
                    const blob = new Blob([data], { type: 'video/mp4' });
                    const reader = new FileReader();
                    
                    reader.onload = function() {
                        const base64Data = reader.result.split(',')[1];
                        browser.tabs.sendMessage(tabId, {
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

        for (let i = 0; i < segments.length; i++) {
            const segmentData = await requestSegment(tabId, segments[i]);
            worker.postMessage({
                type: 'PROCESS_SEGMENT',
                data: segmentData,
                processedSize: (i + 1) * segmentData.byteLength,
                totalSize: segments.length * segmentData.byteLength
            }, [segmentData]);
        }

        worker.postMessage({ type: 'FINALIZE' });

    } catch (error) {
        browser.tabs.sendMessage(tabId, { 
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
        const messageListener = (message) => {
            if (message.segmentId === segmentId) {
                if (message.type === 'SEGMENT_DATA') {
                    browser.runtime.onMessage.removeListener(messageListener);
                    resolve(base64ToArrayBuffer(message.data));
                } else if (message.type === 'SEGMENT_ERROR') {
                    browser.runtime.onMessage.removeListener(messageListener);
                    reject(new Error(message.error));
                }
            }
        };
        
        browser.runtime.onMessage.addListener(messageListener);
        
        // Request the segment from content script
        browser.tabs.sendMessage(tabId, {
            type: 'FETCH_SEGMENT',
            segmentId: segmentId,
            url: segment.url,
            byteRange: segment.byteRange
        });
    });
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