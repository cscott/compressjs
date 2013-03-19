/* Some basic utilities, used in a number of places. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./makeBuffer','./freeze','./Stream'],function(makeBuffer, freeze, Stream) {
    var Util = Object.create(null);

    var EOF = Stream.EOF;

    /* Take a buffer, array, or stream, and return an input stream. */
    Util.coerceInputStream = function(input, forceRead) {
        if (!('readByte' in input)) {
            var buffer = input;
            input = new Stream();
            input.size = buffer.length;
            input.pos = 0;
            input.readByte = function() {
                if (this.pos >= this.size) { return EOF; }
                return buffer[this.pos++];
            };
            input.read = function(buf, bufOffset, length) {
                var bytesRead = 0;
                while (bytesRead < length && this.pos < buffer.length) {
                    buf[bufOffset++] = buffer[this.pos++];
                    bytesRead++;
                }
                return bytesRead;
            };
            input.seek = function(pos) { this.pos = pos; };
            input.tell = function() { return this.pos; };
            input.eof = function() { return this.pos >= buffer.length; };
        } else if (forceRead && !('read' in input)) {
            // wrap input if it doesn't implement read
            var s = input;
            input = new Stream();
            input.readByte = function() {
                var ch = s.readByte();
                if (ch === EOF) { this._eof = true; }
                return ch;
            };
            if ('size' in s) { input.size = s.size; }
            if ('seek' in s) {
                input.seek = function(pos) {
                    s.seek(pos); // may throw if s doesn't implement seek
                    this._eof = false;
                };
            }
            if ('tell' in s) {
                input.tell = s.tell.bind(s);
            }
        }
        return input;
    };

    var BufferStream = function(buffer, resizeOk) {
        this.buffer = buffer;
        this.resizeOk = resizeOk;
        this.pos = 0;
    };
    BufferStream.prototype = Object.create(Stream.prototype);
    BufferStream.prototype.writeByte = function(_byte) {
        if (this.resizeOk && this.pos >= this.buffer.length) {
            var newBuffer = makeBuffer(this.buffer.length * 2);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
        }
        this.buffer[this.pos++] = _byte;
    };
    BufferStream.prototype.getBuffer = function() {
        // trim buffer if needed
        if (this.pos !== this.buffer.length) {
            if (!this.resizeOk)
                throw new TypeError('outputsize does not match decoded input');
            var newBuffer = makeBuffer(this.pos);
            newBuffer.set(this.buffer.subarray(0, this.pos));
            this.buffer = newBuffer;
        }
        return this.buffer;
    };

    /* Take a stream (or not) and an (optional) size, and return an
     * output stream.  Return an object with a 'retval' field equal to
     * the output stream (if that was given) or else a pointer at the
     * internal Uint8Array/buffer/array; and a 'stream' field equal to
     * an output stream to use.
     */
    Util.coerceOutputStream = function(output, size) {
        var r = { stream: output, retval: output };
        if (output) {
            if (typeof(output)==='object' && 'writeByte' in output) {
                return r; /* leave output alone */
            } else if (typeof(size) === 'number') {
                console.assert(size >= 0);
                r.stream = new BufferStream(makeBuffer(size), false);
            } else { // output is a buffer
                r.stream = new BufferStream(output, false);
            }
        } else {
            r.stream = new BufferStream(makeBuffer(16384), true);
        }
        Object.defineProperty(r, 'retval', {
            get: r.stream.getBuffer.bind(r.stream)
        });
        return r;
    };

    Util.compressFileHelper = function(magic, guts, suppressFinalByte) {
        return function(inStream, outStream, props) {
            inStream = Util.coerceInputStream(inStream);
            var o = Util.coerceOutputStream(outStream, outStream);
            outStream = o.stream;

            // write the magic number to identify this file type
            // (it better be ascii, we're not doing utf-8 conversion)
            var i;
            for (i=0; i<magic.length; i++) {
                outStream.writeByte(magic.charCodeAt(i));
            }

            // if we know the size, write it
            var fileSize;
            if ('size' in inStream && inStream.size >= 0) {
                fileSize = inStream.size;
            } else {
                fileSize = -1; // size unknown
            }
            if (suppressFinalByte) {
                var tmpOutput = Util.coerceOutputStream([]);
                Util.writeUnsignedNumber(tmpOutput.stream, fileSize + 1);
                tmpOutput = tmpOutput.retval;
                for (i=0; i<tmpOutput.length-1; i++) {
                    outStream.writeByte(tmpOutput[i]);
                }
                suppressFinalByte = tmpOutput[tmpOutput.length-1];
            } else {
                Util.writeUnsignedNumber(outStream, fileSize + 1);
            }

            // call the guts to do the real compression
            guts(inStream, outStream, fileSize, props, suppressFinalByte);

            return o.retval;
        };
    };
    Util.decompressFileHelper = function(magic, guts) {
        return function(inStream, outStream) {
            inStream = Util.coerceInputStream(inStream);

            // read the magic number to confirm this file type
            // (it better be ascii, we're not doing utf-8 conversion)
            var i;
            for (i=0; i<magic.length; i++) {
                if (magic.charCodeAt(i) !== inStream.readByte()) {
                    throw new Error("Bad magic");
                }
            }

            // read the file size & create an appropriate output stream/buffer
            var fileSize = Util.readUnsignedNumber(inStream) - 1;
            var o = Util.coerceOutputStream(outStream, fileSize);
            outStream = o.stream;

            // call the guts to do the real decompression
            guts(inStream, outStream, fileSize);

            return o.retval;
        };
    };
    // a helper for simple self-test of model encode
    Util.compressWithModel = function(inStream, fileSize, model) {
        var inSize = 0;
        while (inSize !== fileSize) {
            var ch = inStream.readByte();
            if (ch === EOF) {
                model.encode(256); // end of stream;
                break;
            }
            model.encode(ch);
            inSize++;
        }
    };
    // a helper for simple self-test of model decode
    Util.decompressWithModel = function(outStream, fileSize, model) {
        var outSize = 0;
        while (outSize !== fileSize) {
            var ch = model.decode();
            if (ch === 256) {
                break; // end of stream;
            }
            outStream.writeByte(ch);
            outSize++;
        }
    };

    /** Write a number using a self-delimiting big-endian encoding. */
    Util.writeUnsignedNumber = function(output, n) {
        console.assert(n >= 0);
        var bytes = [], i;
        do {
            bytes.push(n & 0x7F);
            // use division instead of shift to allow encoding numbers up to
            // 2^53
            n = Math.floor( n / 128 );
        } while (n !== 0);
        bytes[0] |= 0x80; // mark end of encoding.
        for (i=bytes.length-1; i>=0; i--) {
            output.writeByte(bytes[i]); // write in big-endian order
        }
        return output;
    };

    /** Read a number using a self-delimiting big-endian encoding. */
    Util.readUnsignedNumber = function(input) {
        var n = 0, c;
        while (true) {
            c = input.readByte();
            if (c&0x80) { n += (c&0x7F); break; }
            // using + and * instead of << allows decoding numbers up to 2^53
            n = (n + c) * 128;
        }
        return n;
    };

    /** Proxy for makeBuffer. */
    Util.makeBuffer = makeBuffer;
    /** Equivalent for 16-bit unsigned. */
    Util.makeU16Buffer = function(size) {
        if (typeof(Uint16Array) !== 'undefined') {
            // Uint16Array is automatically zero-filled
            return new Uint16Array(size);
        }
        // fallback
        var result = [];
        for(i = 0; i < size; i++) {
            result[i] = 0;
        }
        return result;
    };

    // there are faster ways to compute this
    Util.ceilLn2 = function(n) {
        console.assert(n>=0);
        var bits = 0;
        while (n >>> bits) {
            bits++;
        }
        return bits;
    };

    return freeze(Util); // ensure constants are recognized as such.
});
