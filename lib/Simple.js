/* *Very* simple de/compression utility, based on simple_c and simple_d from
 * rngcod13.zip at http://www.compressconsult.com/rangecoder/
 * Really just a demonstration/test of the rangecoder.
 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./RangeCoder','./Stream','./Util'],function(RangeCoder,Stream,Util){
    var MAX_BLOCK_SIZE = 1<<17;

    var Simple = Object.create(null);
    Simple.compressFile = function(input, output) {
        input = Util.coerceInputStream(input);
        var o = Util.coerceOutputStream(output);
        output = o.stream;

        var size = -1; // "size unknown"
        if ('size' in input && input.size >= 0) {
            size = input.size;
        }
        var tmpOutput = Util.coerceOutputStream();
        Util.writeUnsignedNumber(tmpOutput.stream, size+1);
        tmpOutput = tmpOutput.retval;
        // write all but one byte of this number (save the final byte for
        // initializing the encoder)
        var i;
        for (i=0; i<tmpOutput.length-1; i++) {
            output.writeByte(tmpOutput[i]);
        }
        var encoder = new RangeCoder(output);
        encoder.encodeStart(tmpOutput[tmpOutput.length-1], tmpOutput.length-1);

        // read a block
        var block = Util.makeBuffer(MAX_BLOCK_SIZE);
        var counts = [];
        var blockLength = 0, sawEOF = false;

        var readBlock = function() {
            var pos = 0;
            // initialize counts
            for (pos=0; pos < 256; pos++) {
                counts[pos] = 0;
            }
            if (sawEOF) {
                blockLength = 0;
                return;
            }
            for (pos=0; pos < MAX_BLOCK_SIZE; ) {
                var c = input.readByte();
                if (c===Stream.EOF) {
                    sawEOF = true;
                    break;
                }
                block[pos++] = c;
                counts[c]++;
                // bail if some count reaches maximum
                if (counts[c]===0xFFFF) {
                    break;
                }
            }
            blockLength = pos;
        };

        while (true) {
            readBlock();
            if (sawEOF && blockLength===0) {
                break;
            }
            // indicate that there's another block comin'
            encoder.encodeBit(true);
            // write all the statistics
            for (i=0; i<256; i++) {
                encoder.encodeShort(counts[i]);
            }
            // convert counts to cumulative counts
            counts[256] = blockLength;
            for (i=256; i; i--) {
                counts[i-1] = counts[i] - counts[i-1];
            }
            // encode the symbols using the probability table.
            for (i=0; i<blockLength; i++) {
                var ch = block[i];
                encoder.encodeFreq(counts[ch+1]-counts[ch], counts[ch],
                                   counts[256]);
            }
        }
        // write a stop bit
        encoder.encodeBit(false);
        // done!
        encoder.encodeFinish();
        return o.retval;
    };
    Simple.decompressFile = function(input, output) {
        input = Util.coerceInputStream(input);
        var size = Util.readUnsignedNumber(input);
        var o = Util.coerceOutputStream(output, size-1);
        output = o.stream;

        var decoder = new RangeCoder(input);
        decoder.decodeStart(true/*we already read the 'free' byte*/);
        while (decoder.decodeBit()) {
            var i, counts = [];
            // read all the statistics
            for (i=0; i<256; i++) {
                counts[i] = decoder.decodeShort();
            }
            // compute cumulative stats & total block size
            var blocksize = 0;
            for (i=0; i<256; i++) {
                var tmp = counts[i];
                counts[i] = blocksize;
                blocksize += tmp;
            }
            counts[256] = blocksize;

            for (i=0; i<blocksize; i++) {
                var cf = decoder.decodeCulFreq(blocksize);
                // inefficient way to look up the symbol.
                var symbol;
                for (symbol=0; symbol<256; symbol++)
                    // careful, there are length-0 ranges
                    // (where counts[symbol]===counts[symbol+1])
                    if (counts[symbol]<=cf && cf < counts[symbol+1])
                        break;
                var ch = symbol;
                decoder.decodeUpdate(counts[symbol+1] - counts[symbol],
                                     counts[symbol], blocksize);
                output.writeByte(symbol);
            }
        }
        decoder.decodeFinish();

        return o.retval;
    };
    return Simple;
});
