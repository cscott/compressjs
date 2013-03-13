/** Abstract Stream interface, for byte-oriented i/o. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./freeze'],function(freeze) {
    var EOF = -1;

    var Stream = function() {
        /* ABSTRACT */
    };
    // you must define one of read / readByte
    Stream.prototype.readByte = function() {
        var buf = [ 0 ];
        var len = this.read(buf, 0, 1);
        if (len===0) { return EOF; }
        return buf[0];
    };
    Stream.prototype.read = function(buf, bufOffset, length) {
        var ch, bytesRead = 0;
        while (bytesRead < length) {
            ch = this.readByte();
            if (ch === EOF) { break; }
            buf[bufOffset+(bytesRead++)] = ch;
        }
        return bytesRead;
    };
    // you must define one of write / writeByte
    Stream.prototype.writeByte = function(_byte) {
        var buf = [ _byte ];
        this.write(buf, 0, 1);
    };
    Stream.prototype.write = function(buf, bufOffset, length) {
        var i;
        for (i=0; i<length; i++) {
            this.writeByte(buf[bufOffset + i]);
        }
        return length;
    };
    // flush will happily do nothing if you don't override it.
    Stream.prototype.flush = function() { };

    // export EOF as a constant.
    Stream.EOF = EOF;

    return freeze(Stream);
});
