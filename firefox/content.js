// ============================================
// Redgifs Downloader - Content Script (Firefox)
// Version 1.4 — Manifest V3
// ============================================

'use strict';

// --- Constants ---
const CURRENT_VERSION = '1.4';
const GITHUB_REPO_API = 'https://api.github.com/repos/freerebirth/Redgifs-download-button/releases/latest';
const GITHUB_REPO_URL = 'https://github.com/freerebirth/Redgifs-download-button';
const BUTTON_RESET_DELAY = 2500;
const OBSERVER_DEBOUNCE_MS = 150;
const CLEANUP_INTERVAL_MS = 5000;
const UPDATE_CHECK_DELAY_MS = 5000;

// --- State ---
const processedPlayers = new WeakSet();

// ============================================
// Retry Manager - Exponential backoff + jitter
// ============================================
class RetryManager {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async execute(operation) {
        let lastError;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries - 1) {
                    const jitter = Math.random() * 0.25 + 0.75;
                    const delay = this.baseDelay * Math.pow(2, attempt) * jitter;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }
}

const retryManager = new RetryManager();

// ============================================
// Button State Management
// ============================================
function setButtonState(btn, state, text) {
    btn.classList.remove('downloading', 'success', 'error');
    if (state) {
        btn.classList.add(state);
    }
    btn.textContent = text;
}

function resetButton(btn) {
    setTimeout(() => {
        setButtonState(btn, null, '⬇️ Download');
        btn.style.pointerEvents = 'auto';
    }, BUTTON_RESET_DELAY);
}

// ============================================
// Update Checker
// ============================================
async function checkForUpdates() {
    try {
        const response = await fetch(GITHUB_REPO_API);
        if (!response.ok) return;

        const release = await response.json();
        const latestVersion = release.tag_name.replace('v', '');

        if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
            showUpdateNotification(latestVersion, release.html_url);
        }
    } catch (error) {
        console.warn('[RedgifsDownloader] Update check failed:', error.message);
    }
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 !== num2) return num1 > num2 ? 1 : -1;
    }
    return 0;
}

function showUpdateNotification(newVersion, updateUrl) {
    const dismissedVersion = localStorage.getItem('redgifs-dismissed-version');
    if (dismissedVersion === newVersion) return;

    // Prevent duplicate notifications
    if (document.querySelector('.redgifs-update-notification')) return;

    const notification = document.createElement('div');
    notification.className = 'redgifs-update-notification';
    notification.innerHTML = `
        <div class="redgifs-update-content">
            <div>
                <strong>🔄 Update Available</strong>
                <p>Version ${newVersion} of RedGifs Downloader is available.</p>
            </div>
            <a href="${updateUrl}" target="_blank" rel="noopener">Download Update</a>
            <div class="redgifs-update-buttons">
                <button class="redgifs-update-button remind">Remind Later</button>
                <button class="redgifs-update-button dismiss">Dismiss</button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    notification.querySelector('.remind').addEventListener('click', () => {
        notification.remove();
    });

    notification.querySelector('.dismiss').addEventListener('click', () => {
        localStorage.setItem('redgifs-dismissed-version', newVersion);
        notification.remove();
    });
}

// ============================================
// Video ID Extraction
// ============================================
function getVideoIdFromContainer(container) {
    // Walk up to GifPreviewV2 if we're inside a player
    if (container.classList && !container.classList.contains('GifPreviewV2')) {
        const gifPreview = container.closest('.GifPreviewV2');
        if (gifPreview) container = gifPreview;
    }

    // 1. Container ID (most reliable)
    if (container.id && container.id.startsWith('gif_')) {
        return container.id.replace('gif_', '');
    }

    // 2. Video poster URL
    const video = container.querySelector('video');
    if (video?.poster) {
        const posterMatch = video.poster.match(/\/([^/]+)-mobile\.jpg$/);
        if (posterMatch?.[1]) return posterMatch[1];
    }

    // 3. Page URL for /watch/ pages
    if (window.location.pathname.includes('/watch/')) {
        const urlMatch = window.location.pathname.match(/\/watch\/([^/]+)/);
        if (urlMatch?.[1]) return urlMatch[1];
    }

    // 4. Meta tags
    const metaTags = document.querySelectorAll('meta[property="og:url"], meta[property="og:video"]');
    for (const meta of metaTags) {
        const content = meta.getAttribute('content');
        if (content) {
            const metaMatch = content.match(/\/([^/]+)(?:\/hd|$)/);
            if (metaMatch?.[1]) return metaMatch[1];
        }
    }

    // 5. Data attributes
    const dataElements = container.querySelectorAll('[data-id], [data-gif-id]');
    for (const el of dataElements) {
        const dataId = el.getAttribute('data-id') || el.getAttribute('data-gif-id');
        if (dataId) return dataId;
    }

    // 6. Image alt text
    const images = container.querySelectorAll('img[alt]');
    for (const img of images) {
        const alt = img.getAttribute('alt');
        if (alt?.startsWith('Poster for ')) {
            const id = alt.replace('Poster for ', '');
            if (id && !id.includes(' ')) return id;
        }
    }

    return null;
}

// ============================================
// Download Logic
// ============================================
async function handleDownload(event) {
    const btn = event.target.closest('.redgifs-download-btn');
    if (!btn) return;

    const wrapper = btn.closest('.redgifs-download-btn-wrapper');
    const containerId = wrapper?.dataset.containerId;
    const container = containerId
        ? document.getElementById(containerId)
        : btn.closest('.GifPreviewV2');

    if (!container) return;

    const videoId = getVideoIdFromContainer(container);
    if (!videoId) {
        setButtonState(btn, 'error', '❌ No video ID');
        resetButton(btn);
        return;
    }

    setButtonState(btn, 'downloading', '⏳ Fetching...');
    btn.style.pointerEvents = 'none';

    // Strategy 1: Redgifs API v2 — get direct MP4 URL (works for all videos)
    try {
        const directUrl = await getDirectVideoUrl(videoId);
        if (directUrl) {
            await downloadViaBackground(directUrl, videoId, btn);
            return;
        }
    } catch {
        // API failed, try next strategy
    }

    // Strategy 2: HLS/m3u8 manifest (newer videos)
    try {
        const apiUrl = `https://api.redgifs.com/v2/gifs/${videoId}/hd.m3u8`;
        const manifest = await fetchM3u8(apiUrl);

        // Verify it's actually a manifest, not an XML error
        if (manifest && manifest.includes('#EXTM3U')) {
            const m4sUrl = extractM4sUrl(manifest, videoId);
            if (m4sUrl) {
                await downloadViaBackground(m4sUrl, videoId, btn);
                return;
            }
        }
    } catch {
        // m3u8 failed, try next strategy
    }

    // Strategy 3: Direct m4s URL (last resort)
    try {
        const capitalizedId = videoId.charAt(0).toUpperCase() + videoId.slice(1);
        const directUrl = `https://media.redgifs.com/${capitalizedId}.m4s`;
        await downloadViaBackground(directUrl, videoId, btn);
    } catch {
        setButtonState(btn, 'error', '❌ Failed');
        resetButton(btn);
    }
}

// ============================================
// Redgifs API v2 — Direct URL resolver
// ============================================
let cachedToken = null;
let tokenExpiry = 0;

async function getRedgifsToken() {
    // Return cached token if still valid (refresh 5 min before expiry)
    if (cachedToken && Date.now() < tokenExpiry - 300000) {
        return cachedToken;
    }

    const response = await fetch('https://api.redgifs.com/v2/auth/temporary');
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);

    const data = await response.json();
    cachedToken = data.token;
    // Tokens typically last ~24h, refresh after 23h
    tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return cachedToken;
}

async function getDirectVideoUrl(videoId) {
    const token = await getRedgifsToken();

    const response = await fetch(`https://api.redgifs.com/v2/gifs/${videoId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) throw new Error(`API failed: ${response.status}`);

    const data = await response.json();
    const urls = data?.gif?.urls;

    if (!urls) throw new Error('No URLs in response');

    // Prefer HD, fall back to SD
    return urls.hd || urls.sd || null;
}


function downloadViaBackground(url, videoId, btn) {
    return new Promise((resolve) => {
        setButtonState(btn, 'downloading', '⏳ Downloading...');

        browser.runtime.sendMessage({
            type: 'DOWNLOAD_DIRECT',
            url,
            filename: `redgifs_${videoId}.mp4`
        }).then((response) => {
            if (response?.success) {
                setButtonState(btn, 'success', '✅ Downloaded');
            } else {
                setButtonState(btn, 'error', '❌ Error');
            }
            resetButton(btn);
            resolve();
        }).catch(() => {
            setButtonState(btn, 'error', '❌ Error');
            resetButton(btn);
            resolve();
        });
    });
}

// ============================================
// M3U8 Parsing
// ============================================
function extractM4sUrl(manifest, videoId) {
    const lines = manifest.split('\n');

    for (const line of lines) {
        if (line.includes('.m4s') || line.includes('.mp4')) {
            if (line.includes('EXT-X-MAP:URI=')) {
                const uriMatch = line.match(/URI="([^"]+)"/);
                if (uriMatch?.[1]) return uriMatch[1];
            }
            if (line.startsWith('http') || line.startsWith('/')) {
                return line.trim();
            }
        }
    }

    return `https://media.redgifs.com/${videoId.charAt(0).toUpperCase() + videoId.slice(1)}.m4s`;
}

async function fetchM3u8(url) {
    return retryManager.execute(() => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 10000;

            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error(`m3u8 fetch failed: ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error fetching m3u8'));
            xhr.ontimeout = () => reject(new Error('Timeout fetching m3u8'));
            xhr.send();
        });
    });
}

// ============================================
// Button Injection
// ============================================
function addDownloadButton(container) {
    if (!container) return;

    // Generate a stable ID for tracking
    if (!container.id) {
        container.id = 'redgifs-container-' + Math.random().toString(36).substring(2, 9);
    }

    // Skip if already has a button
    if (container.querySelector('.redgifs-download-btn-wrapper')) return;

    const existingWrapper = document.querySelector(
        `.redgifs-download-btn-wrapper[data-container-id="${container.id}"]`
    );
    if (existingWrapper) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'redgifs-download-btn-wrapper';
    wrapper.dataset.containerId = container.id;

    const btn = document.createElement('button');
    btn.className = 'redgifs-download-btn';
    btn.textContent = '⬇️ Download';

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownload(e);
    });

    wrapper.appendChild(btn);
    container.appendChild(wrapper);
}

// ============================================
// DOM Observer — Detect new videos
// ============================================
function processElement(element) {
    if (!element || !element.classList) return;

    // Direct match on player containers
    if (element.classList.contains('TapTracker') || element.classList.contains('PlayerV2')) {
        if (!processedPlayers.has(element)) {
            processedPlayers.add(element);
            addDownloadButton(element);
        }
        return;
    }

    // GifPreviewV2 — look for inner player
    if (element.classList.contains('GifPreviewV2')) {
        const player = element.querySelector('.TapTracker, .PlayerV2');
        const target = player || element;
        if (!processedPlayers.has(target)) {
            processedPlayers.add(target);
            addDownloadButton(target);
        }
        return;
    }

    // Fallback for video elements
    if (element.tagName === 'VIDEO') {
        const playerContainer = element.closest('.TapTracker, .PlayerV2, .GifPreviewV2');
        if (playerContainer && !processedPlayers.has(playerContainer)) {
            processedPlayers.add(playerContainer);
            addDownloadButton(playerContainer);
        }
    }
}

function initObservers() {
    let debounceTimer = null;
    let pendingNodes = [];

    const processPendingNodes = () => {
        const nodes = pendingNodes;
        pendingNodes = [];
        debounceTimer = null;

        for (const node of nodes) {
            processElement(node);
            if (node.querySelectorAll) {
                node.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2, video')
                    .forEach(processElement);
            }
        }
    };

    const cleanupOrphanedWrappers = () => {
        document.querySelectorAll('.redgifs-download-btn-wrapper').forEach(wrapper => {
            const containerId = wrapper.dataset.containerId;
            if (!containerId) {
                wrapper.remove();
                return;
            }
            const container = document.getElementById(containerId);
            if (!container || !document.body.contains(container)) {
                wrapper.remove();
            }
        });
    };

    const observer = new MutationObserver((mutations) => {
        let needsCleanup = false;

        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue;

            if (mutation.removedNodes.length > 0) needsCleanup = true;

            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    pendingNodes.push(node);
                }
            }
        }

        if (pendingNodes.length > 0 && !debounceTimer) {
            debounceTimer = setTimeout(processPendingNodes, OBSERVER_DEBOUNCE_MS);
        }

        if (needsCleanup) cleanupOrphanedWrappers();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial scan
    document.querySelectorAll('.GifPreviewV2, .TapTracker, .PlayerV2')
        .forEach(processElement);

    // Periodic cleanup for orphaned wrappers
    setInterval(cleanupOrphanedWrappers, CLEANUP_INTERVAL_MS);
}

// ============================================
// Message Listener — Background communication
// ============================================
browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'FETCH_SEGMENT') {
        fetchSegmentAndRespond(message.segmentId, message.url, message.byteRange);
    }
});

async function fetchSegmentAndRespond(segmentId, url, byteRange) {
    try {
        const buffer = await retryManager.execute(() => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';
                xhr.timeout = 30000;

                if (byteRange) {
                    const start = byteRange.start || byteRange.offset || 0;
                    const end = start + byteRange.length - 1;
                    xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
                }

                xhr.onload = () => {
                    if (xhr.status === 200 || xhr.status === 206) {
                        resolve(xhr.response);
                    } else {
                        reject(new Error(`Segment fetch failed: ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('Network error fetching segment'));
                xhr.ontimeout = () => reject(new Error('Timeout fetching segment'));
                xhr.send();
            });
        });

        browser.runtime.sendMessage({
            type: 'SEGMENT_DATA',
            segmentId,
            data: arrayBufferToBase64(buffer)
        });
    } catch (error) {
        browser.runtime.sendMessage({
            type: 'SEGMENT_ERROR',
            segmentId,
            error: error.message
        });
    }
}

// ============================================
// Utilities
// ============================================
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(''));
}

// ============================================
// Initialization
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObservers);
} else {
    initObservers();
}

// Check for updates after a delay
setTimeout(checkForUpdates, UPDATE_CHECK_DELAY_MS);