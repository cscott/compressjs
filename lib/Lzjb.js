/* Tweaked version of LZJB, using range coder. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./RangeCoder','./Util'],function(RangeCoder, Util){

var Lzjb = Object.create(null);

// Constants was used for compress/decompress function.
var NBBY = 8,
    MATCH_BITS = 6,
    MATCH_MIN = 3,
    MATCH_MAX = ((1 << MATCH_BITS) + (MATCH_MIN - 1)),
    OFFSET_MASK = ((1 << (16 - MATCH_BITS)) - 1),
    LEMPEL_SIZE_BASE = 1024;

/* very simple order-0 probability model */
var Model = function(coder, size) {
    this.coder = coder;
    this.sym = Util.makeU16Buffer(size+1);
    this.prob= Util.makeU16Buffer(size+2);
    this.sym[0] = size; // escape code
    this.prob[0]= 0;
    this.seenSyms = 1;
    this.prob[this.seenSyms] = 1; // total probability always found here
    this.numSyms = size;
};
Model.prototype._update = function(symbol, index, sy_f) {
    var j, tot_f;
    // move this symbol to the end
    for (j=index; j<this.seenSyms-1; j++) {
        this.sym[j] = this.sym[j+1];
        this.prob[j] = this.prob[j+1] - sy_f;
    }
    if (index < this.seenSyms) {
        this.sym[j] = symbol;
        this.prob[j] = this.prob[j+1] - sy_f;
        // increase frequency for this symbol, and total freq at same time
        tot_f = ++this.prob[this.seenSyms];
    } else { // add to the end
        tot_f = this.prob[this.seenSyms];
        this.sym[index] = symbol;
        this.prob[index] = tot_f;
        this.prob[++this.seenSyms] = ++tot_f;
    }
    if (tot_f === 0xFFFF) { this._rescale(); }
    return;
};
Model.prototype._rescale = function() {
    var i, j, total=0;
    for(i=0, j=0; i<this.seenSyms; i++) {
        var sym = this.sym[i];
        var sy_f = this.prob[i+1] - this.prob[i];
        sy_f >>>= 1;
        if (sy_f > 0) {
            this.sym[j] = sym;
            this.prob[j++] = total;
            total += sy_f;
        } else if (sym === this.numSyms) {
            // don't allow escape to go to zero prob
            this.sym[j] = sym;
            this.prob[j++] = total;
            total += sy_f + 1;
        }
    }
    this.prob[j] = total;
    this.seenSyms = j;
};
Model.prototype.decode = function() {
    var tot_f = this.prob[this.seenSyms];
    var prob = this.coder.decodeCulFreq(tot_f);
    // we're expecting to find the probability near the "most recent" side
    // of our array
    var i;
    for (i=this.seenSyms-1; i>=0; i--) {
        if (this.prob[i] <= prob /*&& prob < this.prob[i+1]*/)
            break;
    }
    console.assert(i>=0);
    var symbol = this.sym[i];
    var lt_f = this.prob[i];
    var sy_f = this.prob[i + 1] - lt_f;
    this.coder.decodeUpdate(sy_f, lt_f, tot_f);
    this._update(symbol, i, sy_f);
    if (symbol === this.numSyms) {
        /* this is an escape */
        /* decode the literal */
        symbol = this.coder.decodeCulFreq(this.numSyms);
        this.coder.decodeUpdate(1, symbol, this.numSyms);
        this._update(symbol, this.seenSyms);
    }
    return symbol;
};
Model.prototype.encode = function(symbol) {
    // look for symbol, from most-recent to oldest
    var i, tot_f;
    for (i=this.seenSyms-1; i>=0; i--) {
        if (symbol === this.sym[i]) {
            // ok, found it.
            var lt_f = this.prob[i];
            var sy_f = this.prob[i + 1] - lt_f;
            tot_f = this.prob[this.seenSyms];
            this.coder.encodeFreq(sy_f, lt_f, tot_f);
            return this._update(symbol, i, sy_f);
        }
    }
    // couldn't find this symbol.  encode as escape.
    console.assert(symbol !== this.numSyms); // catch infinite recursion
    this.encode(this.numSyms); // guaranteed to be found in the table.
    // code symbol as literal
    this.coder.encodeFreq(1, symbol, this.numSyms);
    // now add symbol to the end.
    return this._update(symbol, this.seenSyms);
};

/**
 * Compress using modified LZJB algorithm.  Instead of using the simple
 * 9-bit literal / 17-bit match format of the original, use a range
 * coder for the literal/match bit and for the offset and length.
 */
Lzjb.compressFile = function(inStream, outStream, props) {
    var sstart, dstart = [], slen,
        src = 0, dst = 0,
        cpy, copymap,
        mlen, offset,
        hash, hp,
        lempel,
        i, j;

    // in an improvement over the original C implementation of LZJB, we expand
    // the hash table to track a number of potential matches, not just the
    // most recent.  This doesn't require any changes to the decoder.
    var LEMPEL_SIZE = LEMPEL_SIZE_BASE;
    var EXPAND = 1; // default to original C impl
    if (typeof(props)==='number') {
        LEMPEL_SIZE *= 2;
        props = Math.max(1, Math.min(9, props)) - 1;
        EXPAND = 1<<Math.floor(props/2);
        if (props&1) EXPAND = Math.round(EXPAND * 1.5);
        if (props >=2 && props <= 4) EXPAND++;
    }

    inStream = Util.coerceInputStream(inStream);
    var o = Util.coerceOutputStream(outStream);
    outStream = o.stream;

    // if we know the size, write it
    var fileSize;
    if ('size' in inStream && inStream.size >= 0) {
        fileSize = inStream.size;
    } else {
        fileSize = -1; // size unknown
    }
    // write all but one byte of this number (save the final byte for
    // initializing the encoder)
    var tmpOutput = Util.coerceOutputStream();
    Util.writeUnsignedNumber(tmpOutput.stream, fileSize+1);
    tmpOutput = tmpOutput.retval;
    for (i=0; i<tmpOutput.length-1; i++) {
        outStream.writeByte(tmpOutput[i]);
    }
    var encoder = new RangeCoder(outStream);
    encoder.encodeStart(tmpOutput[tmpOutput.length-1], tmpOutput.length-1);

    // use Uint16Array if available (zero-filled)
    lempel = Util.makeU16Buffer(LEMPEL_SIZE * EXPAND);

    var window = Util.makeBuffer(OFFSET_MASK+1);
    var windowpos = 0;
    var winput = function(_byte) {
        window[windowpos++] = _byte;
        if (windowpos >= window.length) {
            windowpos = 0;
        }
        return _byte;
    };

    var unbuffer = [];
    var get = function() {
        if (unbuffer.length)
            return unbuffer.pop();
        return inStream.readByte();
    };
    var unget = function(_byte) {
        unbuffer.push(_byte);
    };

    var matchpossibility = [];
    var MATCH = 256;
    var EOF_SYM = 257;
    var literalModel = new Model(encoder, ((fileSize<0) ? EOF_SYM : MATCH) + 1);
    var lenModel = new Model(encoder, (MATCH_MAX-MATCH_MIN)+1);
    var posModel = new Model(encoder, OFFSET_MASK+1);
    while (true) {
        var initialPos = windowpos;
        var c1 = get();
        if (c1 === Util.EOF) break;

        var c2 = get();
        if (c2 === Util.EOF) {
            literalModel.encode(c1); // literal, not a match
            break;
        }
        var c3 = get();
        if (c3 === Util.EOF) {
            literalModel.encode(c1); // literal, not a match
            unget(c2);
            continue;
        }

        hash = (c1 << 16) + (c2 << 8) + c3;
        hash ^= (hash >> 9);
        hash += (hash >> 5);
        hash ^= c1;
        hp = (hash & (LEMPEL_SIZE - 1)) * EXPAND;
        matchpossibility.length = 0;
        for (j=0; j<EXPAND; j++) {
            offset = (windowpos - lempel[hp+j]) & OFFSET_MASK;
            cpy = window.length + windowpos - offset;
            var w1 = window[cpy & OFFSET_MASK];
            var w2 = window[(cpy+1) & OFFSET_MASK];
            var w3 = window[(cpy+2) & OFFSET_MASK];
            // if offset is small, we might not have copied the tentative
            // bytes into the window yet.  (Note that offset=0 really means
            // offset=(OFFSET_MASK+1).)
            if (offset==1) { w2 = c1; w3 = c2; }
            else if (offset==2) { w3 = c1; }
            if (c1 === w1 && c2 === w2 && c3 === w3) {
                matchpossibility.push(offset);
            }
        }
        // store this location in the hash, move the others over to make room
        // oldest match drops off
        for (j=EXPAND-1; j>0; j--)
            lempel[hp+j] = lempel[hp+j-1];
        lempel[hp] = windowpos;
        // did we find any matches?
        if (matchpossibility.length === 0) {
            literalModel.encode(winput(c1)); // literal, not a match
            unget(c3);
            unget(c2);
        } else {
            literalModel.encode(MATCH); // a match!
            // find the longest of the possible matches
            winput(c1); winput(c2); winput(c3);
            var c4 = get(), last = matchpossibility[0];
            var base = window.length + windowpos;
            for (mlen = MATCH_MIN; mlen < MATCH_MAX; mlen++, base++) {
                if (c4 === Util.EOF) break;
                for (j=0; j < matchpossibility.length; ) {
                    var w4 = window[(base - matchpossibility[j]) & OFFSET_MASK];
                    if (c4 !== w4) {
                        last = matchpossibility[j];
                        matchpossibility.splice(j, 1);
                    } else {
                        j++;
                    }
                }
                if (matchpossibility.length===0) break; // no more matches
                winput(c4);
                c4 = get();
            }
            if (matchpossibility.length !== 0) {
                // maximum length match, rock on!
                last = matchpossibility[0];
            }
            unget(c4);

            // encode match length
            lenModel.encode(mlen - MATCH_MIN);
            posModel.encode((initialPos - last) & OFFSET_MASK);
        }
    }
    if (fileSize < 0) {
        literalModel.encode(EOF_SYM); // end of file (streaming)
    }
    encoder.encodeFinish();

    return o.retval;
};

/**
 * Decompress using modified LZJB algorithm.
 */
Lzjb.decompressFile = function(inStream, outStream) {
    var sstart, dstart = [], slen,
        src = 0, dst = 0,
        cpy, copymap,
        mlen, offset,
        i, c;

    var window = Util.makeBuffer(OFFSET_MASK+1);
    var windowpos = 0;

    inStream = Util.coerceInputStream(inStream);
    var outSize = Util.readUnsignedNumber(inStream) - 1;
    var o = Util.coerceOutputStream(outStream, outSize);
    outStream = o.stream;

    var decoder = new RangeCoder(inStream);
    decoder.decodeStart(true/* we already read the 'free' byte*/);

    var MATCH = 256;
    var EOF_SYM = 257;
    var literalModel = new Model(decoder, ((outSize<0) ? EOF_SYM : MATCH) + 1);
    var lenModel = new Model(decoder, (MATCH_MAX-MATCH_MIN)+1);
    var posModel = new Model(decoder, OFFSET_MASK+1);

    while (outSize !== 0) {
        c = literalModel.decode();
        if (c === EOF_SYM) {
            break;
        } else if (c === MATCH) {
            mlen = lenModel.decode() + MATCH_MIN;
            cpy = posModel.decode();
            if (outSize >= 0) outSize -= mlen;
            while (--mlen >= 0) {
                c = window[windowpos++] = window[cpy++];
                outStream.writeByte(c);
                if (windowpos >= window.length) { windowpos=0; }
                if (cpy >= window.length) { cpy = 0; }
            }
        } else {
            outStream.writeByte(c);
            window[windowpos++] = c;
            if (windowpos >= window.length) { windowpos=0; }
            if (outSize >= 0) outSize--;
        }
    }
    decoder.decodeFinish();
    return o.retval;
};


return Lzjb;
});
