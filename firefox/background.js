// ============================================
// Redgifs Downloader - Background Script (Firefox MV3)
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
browser.runtime.onMessage.addListener((message, sender) => {
    switch (message.type) {
        case 'DOWNLOAD_DIRECT':
            return handleDirectDownload(message.url, message.filename);

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
});

// ============================================
// Direct Download (primary method)
// ============================================
async function handleDirectDownload(url, filename) {
    const result = await browser.storage.local.get('downloadFolder');
    const folder = result.downloadFolder || DEFAULT_DOWNLOAD_FOLDER;
    const finalFilename = folder + filename;

    try {
        const downloadId = await browser.downloads.download({
            url,
            filename: finalFilename,
            saveAs: false
        });
        return { success: true, downloadId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// M3U8 Segment Processing (fallback method)
// ============================================
function parseM3u8(manifest) {
    const lines = manifest.split('\n');
    const segments = [];
    let initSegment = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXT-X-MAP:')) {
            const uriMatch = line.match(/URI="([^"]+)"/);
            if (uriMatch?.[1]) {
                let byteRange = null;
                const byteRangeMatch = line.match(/BYTERANGE="([^"]+)"/);
                if (byteRangeMatch?.[1]) {
                    const rangeParts = byteRangeMatch[1].split('@');
                    if (rangeParts.length === 2) {
                        byteRange = {
                            length: parseInt(rangeParts[0], 10),
                            start: parseInt(rangeParts[1], 10)
                        };
                    }
                }
                initSegment = { url: uriMatch[1], byteRange };
            }
        }

        if (line.startsWith('#EXTINF:')) {
            const durationMatch = line.match(/#EXTINF:([^,]+)/);
            const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

            if (i + 1 < lines.length) {
                const segmentUrl = lines[++i].trim();
                if (!segmentUrl.startsWith('#')) {
                    let byteRange = null;

                    // Check for byte range on preceding line
                    if (i > 1 && lines[i - 2].startsWith('#EXT-X-BYTERANGE:')) {
                        const rangeInfo = lines[i - 2].substring(17).trim();
                        const rangeParts = rangeInfo.split('@');
                        byteRange = {
                            length: parseInt(rangeParts[0], 10),
                            start: rangeParts.length === 2 ? parseInt(rangeParts[1], 10) : 0
                        };
                    }

                    segments.push({ url: segmentUrl, duration, byteRange });
                }
            }
        }
    }

    return { segments, initSegment };
}

// ============================================
// Video Processing Pipeline
// ============================================
async function handleVideoProcessing(videoId, manifest, tabId) {
    try {
        const { segments, initSegment } = parseM3u8(manifest);

        if (segments.length === 0) {
            throw new Error('No segments found in manifest');
        }

        // Process init segment
        let initData = null;
        if (initSegment) {
            initData = await fetchSegmentFromContentScript(tabId, initSegment);
        }

        // Process video segments
        const videoSegments = [];
        for (let i = 0; i < segments.length; i++) {
            const segmentData = await fetchSegmentFromContentScript(tabId, segments[i]);
            videoSegments.push(segmentData);

            const progress = ((i + 1) / segments.length) * 100;
            browser.tabs.sendMessage(tabId, {
                type: 'PROGRESS_UPDATE',
                progress
            }).catch(() => {}); // Tab may have closed
        }

        // Combine segments
        const totalSize = videoSegments.reduce((t, s) => t + s.byteLength, 0)
            + (initData ? initData.byteLength : 0);

        const finalResult = new Uint8Array(totalSize);
        let offset = 0;

        if (initData) {
            finalResult.set(new Uint8Array(initData), offset);
            offset += initData.byteLength;
        }

        for (const segment of videoSegments) {
            finalResult.set(new Uint8Array(segment), offset);
            offset += segment.byteLength;
        }

        // Download
        const blob = new Blob([finalResult], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        const storageResult = await browser.storage.local.get('downloadFolder');
        const folder = storageResult.downloadFolder || DEFAULT_DOWNLOAD_FOLDER;

        await browser.downloads.download({
            url,
            filename: `${folder}redgifs_${videoId}.mp4`,
            saveAs: false
        });
    } catch (error) {
        browser.tabs.sendMessage(tabId, {
            type: 'DOWNLOAD_ERROR',
            error: error.message
        }).catch(() => {});
    }
}

// ============================================
// Segment Communication
// ============================================
function fetchSegmentFromContentScript(tabId, segment) {
    return new Promise((resolve, reject) => {
        const segmentId = Math.random().toString(36).substring(2, 9);
        pendingSegments.set(segmentId, { resolve, reject });

        browser.tabs.sendMessage(tabId, {
            type: 'FETCH_SEGMENT',
            segmentId,
            url: segment.url,
            byteRange: segment.byteRange
        }).catch(() => {
            pendingSegments.delete(segmentId);
            reject(new Error('Failed to reach content script'));
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