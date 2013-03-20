/* A simple bzip-like BWT compressor with a range encoder; written as a
 * self-test of the BWT package. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./freeze','./BWT','./FenwickModel','./LogDistanceModel','./NoModel','./RangeCoder','./Stream','./Util'], function(freeze, BWT, FenwickModel, LogDistanceModel, NoModel, RangeCoder, Stream, Util) {
    var EOF = Stream.EOF;

    var F_PROB_MAX  = 0xFF00;
    var F_PROB_INCR = 0x0100;

    BWTC = Object.create(null);
    BWTC.MAGIC = "bwtc";
    BWTC.compressFile = Util.compressFileHelper(BWTC.MAGIC, function(input, output, size, props, finalByte) {
        var encoder = new RangeCoder(output);
        encoder.encodeStart(finalByte, 1);

        var blockSize = 9;
        if (typeof(props)==='number' && props >= 1 && props <= 9) {
            blockSize = props;
        }
        encoder.encodeByte(blockSize);
        blockSize *= 100000;

        var block = new Uint8Array(blockSize);
        var readBlock = function() {
            var pos;
            for (pos=0; pos < blockSize; ) {
                var ch = input.readByte();
                if (ch < 0) { break; }
                block[pos++] = ch;
            }
            return pos;
        };
        var U = new Uint8Array(blockSize);
        var A = new Int32Array(blockSize);
        var M = []; // move to front array
        var bitModelFactory = NoModel.factory(encoder);
        var lenModel = new LogDistanceModel(blockSize, 0,
                                            bitModelFactory,
                                            bitModelFactory);
        var length, b, c, pidx, i, j;
        do {
            length = readBlock();
            if (length === 0) { break; }
            // indicate that there's another block comin'
            // and encode the length of the block if necessary
            if (length === block.length) {
                encoder.encodeFreq(1, 0, 3); // "full size block"
                b = block;
            } else {
                encoder.encodeFreq(1, 1, 3); // "short block"
                lenModel.encode(length);
                b = block.subarray(0, length);
            }
            pidx = BWT.bwtransform(b, U, A, length);
            lenModel.encode(pidx); // starting index
            // MTF encoding of U
            for (i=0; i<256; i++) { M[255-i] = i; } // move-to-back, really
            for (i=0; i<length; i++) {
                c = U[i];
                for (j=0; j<256; j++) {
                    if (M[255-j] === c) {
                        break;
                    }
                }
                console.assert(j<256);
                U[i] = j;
                // move to front (back, really)
                M.splice(255-j, 1);
                M[255] = c;
            }
            // RLE/range encoding
            var model = new FenwickModel(encoder, 257, F_PROB_MAX, F_PROB_INCR);
            var runLength = 0;
            var emitLastRun = function() {
                // binary encode runs of zeros
                while (runLength !== 0) {
                    if (runLength&1) {
                        model.encode(0); // RUNA
                        runLength-=1;
                    } else {
                        model.encode(1); // RUNB
                        runLength-=2;
                    }
                    runLength >>>= 1;
                }
            };
            for (i=0; i<length; i++) {
                c = U[i];
                if (c === 0) {
                    runLength++;
                } else {
                    emitLastRun();
                    model.encode(c+1);
                    // reset for next
                    runLength = 0;
                }
            }
            emitLastRun();
            // done with this block!
        } while (length === block.length);

        encoder.encodeFreq(1, 2, 3); // "no more blocks"
        encoder.encodeFinish();
    }, true);

    BWTC.decompressFile = Util.decompressFileHelper(BWTC.MAGIC, function(input, output, size) {
        var decoder = new RangeCoder(input);
        decoder.decodeStart(true/* already read the extra byte */);
        var blockSize = decoder.decodeByte();
        console.assert(blockSize >= 1 && blockSize <= 9);
        blockSize *= 100000;

        var block = new Uint8Array(blockSize);
        var U = new Uint8Array(blockSize);
        var A = new Int32Array(blockSize);
        var M = []; // move to front array
        var bitModelFactory = NoModel.factory(decoder);
        var lenModel = new LogDistanceModel(blockSize, 0,
                                            bitModelFactory,
                                            bitModelFactory);
        var b, length, i, j, c;
        while (true) {
            var blockIndicator = decoder.decodeCulFreq(3);
            decoder.decodeUpdate(1, blockIndicator, 3);
            if (blockIndicator === 0) { // full-length block
                length = blockSize;
                b = block;
            } else if (blockIndicator === 1) { // short block
                length = lenModel.decode();
                b = block.subarray(0, length);
            } else if (blockIndicator === 2) { // all done, no more blocks
                break;
            }
            // read starting index for unBWT
            var pidx = lenModel.decode();
            // RLE/range decoding
            var model = new FenwickModel(decoder, 257, F_PROB_MAX, F_PROB_INCR);
            var val = 1; // repeat count
            for (i=0; i<length; ) {
                c = model.decode();
                if (c===0) {
                    for (j=0; j<val; j++) { b[i++] = 0; }
                    val *= 2;
                } else if (c===1) {
                    for (j=0; j<val; j++) { b[i++] = 0; b[i++] = 0; }
                    val *= 2;
                } else {
                    val = 1;
                    b[i++] = c-1;
                }
            }
            // MTF decode
            for (i=0; i<256; i++) { M[255-i] = i; } // move-to-back, really
            for (i=0; i<length; i++) {
                c = b[i];
                b[i] = M[255-c];
                // move to front (back, really)
                M.splice(255-c, 1);
                M[255] = b[i];
            }
            // unBWT
            BWT.unbwt(block, U, A, length, pidx);
            // emit!
            output.write(U, 0, length);
        }
        decoder.decodeFinish();
    });

    return BWTC;
});
