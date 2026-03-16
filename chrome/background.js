// ============================================
// Redgifs Downloader - Background Service Worker (Chrome MV3)
// Version 1.4
// ============================================

'use strict';

// Default download subfolder inside Downloads
const DEFAULT_DOWNLOAD_FOLDER = "Redgifs/";

// Track pending segment requests
const pendingSegments = new Map();

// ============================================
// Message Router
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'DOWNLOAD_DIRECT':
            handleDirectDownload(message.url, message.filename, sendResponse);
            return true; // Keep channel open for async response

        case 'FETCH_BLOB':
            fetchVideoAsBase64(message.url, sendResponse);
            return true; // Keep channel open for async response

        case 'PROCESS_VIDEO':
            handleVideoProcessing(message.videoId, message.manifest, sender.tab.id);
            break;

        case 'SEGMENT_DATA':
            handleSegmentData(message.segmentId, message.data);
            break;

        case 'SEGMENT_ERROR':
            handleSegmentError(message.segmentId, message.error);
            break;
    }

    return false;
});

// ============================================
// Direct Download (primary method)
// ============================================
function handleDirectDownload(url, filename, sendResponse) {
    chrome.storage.local.get(['downloadFolder'], (result) => {
        const folder = result.downloadFolder || DEFAULT_DOWNLOAD_FOLDER;
        const finalFilename = folder + filename;

        chrome.downloads.download({
            url,
            filename: finalFilename,
            conflictAction: 'uniquify',
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
    });
}

// ============================================
// M3U8 Segment Processing (fallback method)
// ============================================
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
        } else if (line.startsWith('#EXTINF:')) {
            currentSegment = {
                duration: parseFloat(line.split(':')[1])
            };
        } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
            const [length, offset] = line.split(':')[1].split('@');
            if (currentSegment) {
                currentSegment.byteRange = {
                    offset: parseInt(offset || '0'),
                    length: parseInt(length)
                };
            }
        } else if (!line.startsWith('#') && line.length > 0 && currentSegment) {
            currentSegment.url = line;
            segments.push(currentSegment);
            currentSegment = null;
        }
    }

    return { initSegment, segments };
}

// ============================================
// MP4 Processor — Assembles segments into MP4
// ============================================
class MP4Processor {
    constructor() {
        this.initSegment = null;
        this.mediaSegments = [];
        this.totalSegments = 0;
        this.processedSegments = 0;
    }

    processInitSegment(data) {
        this.initSegment = data;
    }

    processSegment(data) {
        // Skip ftyp/moov boxes if present (already in init segment)
        let start = 0;
        while (start + 8 < data.length) {
            const size = readUint32(data, start);
            const type = getBoxType(data, start + 4);
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
        const chunks = [this.initSegment, ...this.mediaSegments];
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalSize);

        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        // Release memory
        this.initSegment = null;
        this.mediaSegments = [];

        return result;
    }
}

function readUint32(data, offset) {
    return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function getBoxType(data, offset) {
    return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

// ============================================
// Video Processing Pipeline
// ============================================
async function handleVideoProcessing(videoId, manifest, tabId) {
    try {
        const processor = new MP4Processor();
        const { initSegment, segments } = parseM3u8(manifest);

        if (!segments || segments.length === 0) {
            throw new Error('No segments found in manifest');
        }

        processor.totalSegments = segments.length;

        // Process init segment
        if (initSegment) {
            const initData = await requestSegment(tabId, initSegment);
            processor.processInitSegment(new Uint8Array(initData));
        }

        // Process video segments
        for (let i = 0; i < segments.length; i++) {
            const segmentData = await requestSegment(tabId, segments[i]);
            const progress = processor.processSegment(new Uint8Array(segmentData));

            chrome.tabs.sendMessage(tabId, {
                type: 'PROGRESS_UPDATE',
                progress
            });
        }

        // Finalize and download
        const finalResult = processor.finalize();
        const blob = new Blob([finalResult], { type: 'video/mp4' });
        const reader = new FileReader();

        reader.onload = () => {
            chrome.tabs.sendMessage(tabId, {
                type: 'PROCESS_DOWNLOAD',
                videoId,
                data: reader.result.split(',')[1],
                mimeType: 'video/mp4'
            });
        };

        reader.readAsDataURL(blob);
    } catch (error) {
        chrome.tabs.sendMessage(tabId, {
            type: 'DOWNLOAD_ERROR',
            error: error.message
        });
    }
}

// ============================================
// Segment Communication
// ============================================
function requestSegment(tabId, segment) {
    return new Promise((resolve, reject) => {
        const segmentId = Math.random().toString(36).substring(2, 9);
        pendingSegments.set(segmentId, { resolve, reject });

        chrome.tabs.sendMessage(tabId, {
            type: 'FETCH_SEGMENT',
            segmentId,
            url: segment.url,
            byteRange: segment.byteRange
        });
    });
}

function handleSegmentData(segmentId, base64Data) {
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        pendingSegments.delete(segmentId);
        pending.resolve(base64ToArrayBuffer(base64Data));
    }
}

function handleSegmentError(segmentId, error) {
    const pending = pendingSegments.get(segmentId);
    if (pending) {
        pendingSegments.delete(segmentId);
        pending.reject(new Error(error));
    }
}

// ============================================
// Utilities
// ============================================
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Fetch video and return as base64 (fallback for Kiwi/Android)
async function fetchVideoAsBase64(url, sendResponse) {
    try {
        const response = await fetch(url, {
            credentials: 'include',
            mode: 'cors'
        });

        if (!response.ok) {
            sendResponse({ success: false, error: `HTTP ${response.status}` });
            return;
        }

        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunks = [];
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(chunks.join(''));

        sendResponse({ success: true, data: base64, mimeType: 'video/mp4' });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}