/* Some basic utilities, used in a number of places. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./makeBuffer','./freeze','./Stream'],function(makeBuffer, freeze, Stream) {
    var Util = Object.create(null);

    var EOF = Stream.EOF;

    /* Take a buffer, array, or stream, and return an input stream. */
    Util.coerceInputStream = function(input) {
        if (!('readByte' in input)) {
            var buffer = input;
            input = {
                size: buffer.length,
                pos: 0,
                readByte: function() {
                    if (this.pos >= this.size) { return EOF; }
                    return buffer[this.pos++];
                },
                read: function(buf, bufOffset, length) {
                    var bytesRead = 0;
                    while (bytesRead < length && this.pos < buffer.length) {
                        buf[bufOffset++] = buffer[this.pos++];
                        bytesRead++;
                    }
                    return bytesRead;
                }
            };
        }
        // XXX: if we use read(), maybe we want to wrap input if it doesn't
        //      implement read?
        return input;
    };

    /* Take a stream (or not) and an (optional) size, and return an
     * output stream.  Return an object with a 'retval' field equal to
     * the output stream (if that was given) or else a pointer at the
     * internal Uint8Array/buffer/array; and a 'stream' field equal to
     * an output stream to use.
     */
    Util.coerceOutputStream = function(output, size) {
        var retval = output;
        if (!(output && 'writeByte' in output)) {
            var buffer = (typeof(size)==='number' && size>=0) ?
                makeBuffer(size) : [];
            output = {
                pos: 0,
                writeByte: function(_byte) { buffer[this.pos++] = _byte; },
                write: function(buf, bufOffset, length) {
                    var i;
                    for(i=0; i<length; i++) {
                        buffer[this.pos++] = buf[bufOffset + i];
                    }
                    return length;
                },
                flush: function() { /* do nothing */ }
            };
            retval = buffer;
        }
        return { retval: retval, stream: output };
    };

    Util.compressFileHelper = function(magic, guts, suppressFinalByte) {
        return function(inStream, outStream, props) {
            inStream = Util.coerceInputStream(inStream);
            var o = Util.coerceOutputStream(outStream);
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
                var tmpOutput = Util.coerceOutputStream();
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
