/* Some basic utilities, used in a number of places. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./makeBuffer','./freeze'],function(makeBuffer, freeze){
    var Util = Object.create(null);

    var EOF = Util.EOF = -1;

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

    return Util;
});