// ============================================
// Redgifs Downloader - MP4 Worker (Firefox)
// Processes HLS segments into a single MP4 file
// ============================================

'use strict';

class MP4Processor {
    constructor() {
        this.initSegment = null;
        this.mediaSegments = [];
        this.totalSegments = 0;
        this.processedSegments = 0;
    }

    parseM3u8(manifest) {
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

        this.totalSegments = segments.length;
        return { initSegment, segments };
    }

    processInitSegment(data) {
        if (!data || !(data instanceof Uint8Array)) {
            throw new Error('Invalid init segment data');
        }
        this.initSegment = data;
    }

    processSegment(data) {
        if (!data || !(data instanceof Uint8Array)) {
            throw new Error('Invalid segment data');
        }

        // Skip ftyp/moov boxes (already in init)
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
        if (!this.initSegment) {
            throw new Error('No init segment processed');
        }
        if (this.mediaSegments.length === 0) {
            throw new Error('No media segments processed');
        }

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

// --- MP4 box helpers ---
function readUint32(data, offset) {
    return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function getBoxType(data, offset) {
    return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

// --- Worker instance ---
const processor = new MP4Processor();

// --- Message handler ---
self.onmessage = function (e) {
    try {
        const { type, data, manifest } = e.data;

        switch (type) {
            case 'START_PROCESSING': {
                if (!manifest) throw new Error('No manifest provided');

                const { initSegment, segments } = processor.parseM3u8(manifest);

                if (initSegment) {
                    self.postMessage({ type: 'NEED_SEGMENT', data: initSegment });
                }

                for (const segment of segments) {
                    self.postMessage({ type: 'NEED_SEGMENT', data: segment });
                }
                break;
            }

            case 'SEGMENT_DATA': {
                if (!data) throw new Error('No segment data received');

                if (!processor.initSegment) {
                    processor.processInitSegment(new Uint8Array(data));
                } else {
                    const progress = processor.processSegment(new Uint8Array(data));
                    self.postMessage({ type: 'PROGRESS', progress });
                }

                if (processor.processedSegments === processor.totalSegments) {
                    const finalResult = processor.finalize();
                    self.postMessage(
                        { type: 'COMPLETE', data: finalResult.buffer },
                        [finalResult.buffer]
                    );
                }
                break;
            }

            case 'SEGMENT_ERROR':
                throw new Error(data?.error || 'Unknown segment error');
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            data: { error: error.message, stack: error.stack }
        });
    }
};

self.onerror = function (error) {
    self.postMessage({
        type: 'ERROR',
        data: { error: error.message, stack: error.stack }
    });
};