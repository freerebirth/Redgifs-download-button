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
        return { initSegment, segments };
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

// Create processor instance
const processor = new MP4Processor();

// Handle messages from main thread
self.onmessage = async function(e) {
    try {
        const { type, data, videoId, manifest } = e.data;
        
        switch (type) {
            case 'START_PROCESSING':
                const { initSegment, segments } = processor.parseM3u8(manifest);
                
                // Process init segment if present
                if (initSegment) {
                    self.postMessage({
                        type: 'NEED_SEGMENT',
                        data: initSegment
                    });
                }
                
                // Request segments one by one
                for (const segment of segments) {
                    self.postMessage({
                        type: 'NEED_SEGMENT',
                        data: segment
                    });
                }
                break;

            case 'SEGMENT_DATA':
                if (!processor.initSegment) {
                    processor.processInitSegment(new Uint8Array(data));
                } else {
                    const progress = processor.processSegment(new Uint8Array(data));
                    self.postMessage({
                        type: 'PROGRESS',
                        progress: progress
                    });
                }
                
                // If all segments are processed, finalize
                if (processor.processedSegments === processor.totalSegments) {
                    const finalResult = processor.finalize();
                    self.postMessage({
                        type: 'COMPLETE',
                        data: finalResult.buffer
                    }, [finalResult.buffer]);
                }
                break;

            case 'SEGMENT_ERROR':
                throw new Error(data.error);
        }
    } catch (error) {
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
    self.postMessage({
        type: 'ERROR',
        data: {
            error: error.message,
            stack: error.stack
        }
    });
}; 