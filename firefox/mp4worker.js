// MP4 Processing Class
class MP4Processor {
    constructor() {
        this.initSegment = null;
        this.mediaSegments = [];
        this.moovBox = null;
        this.totalSegments = 0;
        this.processedSegments = 0;
    }

    parseM3u8(manifest) {
        console.log('[Worker Debug] Parsing M3U8');
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
        
        this.totalSegments = segments.length;
        console.log('[Worker Debug] Found segments:', segments.length);
        return { initSegment, segments };
    }

    processInitSegment(data) {
        console.log('[Worker Debug] Processing init segment');
        if (!data || !(data instanceof Uint8Array)) {
            throw new Error('Invalid init segment data');
        }
        this.initSegment = data;
        this.moovBox = this.findBox(data, 'moov');
    }

    processSegment(data) {
        console.log('[Worker Debug] Processing segment');
        if (!data || !(data instanceof Uint8Array)) {
            throw new Error('Invalid segment data');
        }

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
        console.log('[Worker Debug] Finalizing MP4');
        if (!this.initSegment) {
            throw new Error('No init segment processed');
        }
        if (this.mediaSegments.length === 0) {
            throw new Error('No media segments processed');
        }

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
        
        console.log('[Worker Debug] MP4 finalized, size:', totalSize);
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

// Create processor instance
const processor = new MP4Processor();

// Handle messages from main thread
self.onmessage = async function(e) {
    try {
        const { type, data, videoId, manifest } = e.data;
        console.log('[Worker Debug] Received message:', type);
        
        switch (type) {
            case 'START_PROCESSING':
                if (!manifest) {
                    throw new Error('No manifest provided');
                }
                const { initSegment, segments } = processor.parseM3u8(manifest);
                
                if (initSegment) {
                    self.postMessage({
                        type: 'NEED_SEGMENT',
                        data: initSegment
                    });
                }
                
                for (const segment of segments) {
                    self.postMessage({
                        type: 'NEED_SEGMENT',
                        data: segment
                    });
                }
                break;

            case 'SEGMENT_DATA':
                if (!data) {
                    throw new Error('No segment data received');
                }
                if (!processor.initSegment) {
                    processor.processInitSegment(new Uint8Array(data));
                } else {
                    const progress = processor.processSegment(new Uint8Array(data));
                    self.postMessage({
                        type: 'PROGRESS',
                        progress: progress
                    });
                }
                
                if (processor.processedSegments === processor.totalSegments) {
                    const finalResult = processor.finalize();
                    self.postMessage({
                        type: 'COMPLETE',
                        data: finalResult.buffer
                    }, [finalResult.buffer]);
                }
                break;

            case 'SEGMENT_ERROR':
                throw new Error(data.error || 'Unknown segment error');
        }
    } catch (error) {
        console.error('[Worker Debug] Error:', error);
        self.postMessage({
            type: 'ERROR',
            data: {
                error: error.message,
                stack: error.stack
            }
        });
    }
};

// Handle worker errors
self.onerror = function(error) {
    console.error('[Worker Debug] Global error:', error);
    self.postMessage({
        type: 'ERROR',
        data: {
            error: error.message,
            stack: error.stack
        }
    });
}; 