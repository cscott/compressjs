/** Simple range coding model w/ escape, suitable for sparse symbol sets. */
// xxx could do better encoding escaped chars by excluding the already-present
//     chars.
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./RangeCoder','./Stream','./Util'],function(RangeCoder,Stream,Util){

var DEFAULT_MAX_PROB = 0xFFFF;

var EscModel = function(coder, size, max_prob) {
    this.coder = coder;
    this.sym = Util.makeU16Buffer(size+1);
    this.prob= Util.makeU16Buffer(size+2);
    this.sym[0] = size; // escape code
    this.prob[0]= 0;
    this.seenSyms = 1;
    this.prob[this.seenSyms] = 1; // total probability always found here
    this.numSyms = size;
    this.MAX_PROB = max_prob || DEFAULT_MAX_PROB;
    this.betterEscape = false;
};
EscModel.factory = function(coder, max_prob) {
    return function(size) { return new EscModel(coder, size, max_prob); };
};
EscModel.prototype.clone = function() {
    var newModel = new EscModel(this.coder, this.numSyms, this.MAX_PROB);
    var i;
    for (i=0; i<this.seenSyms; i++) {
        newModel.sym[i] = this.sym[i];
        newModel.prob[i] = this.prob[i];
    }
    newModel.prob[i] = this.prob[i]; // total probability
    newModel.seenSyms = this.seenSyms;
    return newModel;
};
EscModel.prototype._update = function(symbol, index, sy_f) {
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
        if (symbol === this.numSyms && this.seenSyms >= this.numSyms) {
            // this is the last time we'll see an escape! remove it.
            tot_f = this.prob[--this.seenSyms];
        }
    } else { // add to the end
        tot_f = this.prob[this.seenSyms];
        this.sym[index] = symbol;
        this.prob[index] = tot_f;
        this.prob[++this.seenSyms] = ++tot_f;
    }
    if (tot_f === this.MAX_PROB) { this._rescale(); }
    return;
};
EscModel.prototype._rescale = function() {
    var i, j, total=0;
    var noEscape = true;
    for(i=0, j=0; i<this.seenSyms; i++) {
        var sym = this.sym[i];
        var sy_f = this.prob[i+1] - this.prob[i];
        sy_f >>>= 1;
        if (sy_f > 0) {
            if (sym === this.numSyms) {
                noEscape = false;
            }
            this.sym[j] = sym;
            this.prob[j++] = total;
            total += sy_f;
        }
    }
    this.prob[j] = total;
    this.seenSyms = j;
    // don't allow escape to go to zero prob if we still need it
    if (noEscape && this.seenSyms < this.numSyms) {
        this._update(this.numSyms/*escape*/, this.seenSyms/*at end*/);
    }
};
EscModel.prototype.decode = function() {
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
        sy_f = 1;
        tot_f = this.numSyms;
        if (this.betterEscape) {
            var seen = [];
            for (i=0; i<this.seenSyms; i++) {
                seen.push(this.sym[i]);
            }
            seen.sort(function(a,b) { return a-b; });
            tot_f = this.numSyms - this.seenSyms;
            if (seen[seen.length-1] === this.numSyms) { tot_f++; }
            symbol = lt_f = this.coder.decodeCulFreq(tot_f);
            for (i=0; i < seen.length && seen[i] <= symbol ; i++) {
                symbol++;
            }
        } else {
            symbol = lt_f = this.coder.decodeCulFreq(tot_f);
        }
        this.coder.decodeUpdate(sy_f, lt_f, tot_f);
        this._update(symbol, this.seenSyms);
    }
    return symbol;
};
EscModel.prototype.encode = function(symbol) {
    // look for symbol, from most-recent to oldest
    var i, sy_f, lt_f, tot_f;
    for (i=this.seenSyms-1; i>=0; i--) {
        if (symbol === this.sym[i]) {
            // ok, found it.
            lt_f = this.prob[i];
            sy_f = this.prob[i + 1] - lt_f;
            tot_f = this.prob[this.seenSyms];
            this.coder.encodeFreq(sy_f, lt_f, tot_f);
            return this._update(symbol, i, sy_f);
        }
    }
    // couldn't find this symbol.  encode as escape.
    console.assert(symbol !== this.numSyms); // catch infinite recursion
    this.encode(this.numSyms); // guaranteed to be found in the table.
    // code symbol as literal
    sy_f = 1;
    lt_f = symbol;
    tot_f = this.numSyms;
    if (this.betterEscape) {
        // exclude the seen characters
        for (i=0; i<this.seenSyms; i++) {
            var sym = this.sym[i];
            if (sym === this.numSyms) { continue; /* ignore escape */ }
            if (sym < symbol) { lt_f--; }
            tot_f--;
        }
    }
    this.coder.encodeFreq(sy_f, lt_f, tot_f);
    // now add symbol to the end.
    return this._update(symbol, this.seenSyms);
};

/** Simple order-0 compressor, as self-test. */
EscModel.compressFile = function(inStream, outStream) {
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
  Util.writeUnsignedNumber(outStream, fileSize + 1);

  var range = new RangeCoder(outStream);
  range.encodeStart(0x01, 0);
  var model = new EscModel(range, (fileSize<0) ? 257 : 256);
  var inSize = 0;
  while (inSize !== fileSize) {
    var ch = inStream.readByte();
    if (ch === Stream.EOF) {
      model.encode(256); // end of stream;
      break;
    }
    model.encode(ch);
    inSize++;
  }
  range.encodeFinish();
  return o.retval;
};
/** Simple order-0 decompressor, as self-test. */
EscModel.decompressFile = function(inStream, outStream) {
  inStream = Util.coerceInputStream(inStream);
  var fileSize = Util.readUnsignedNumber(inStream) - 1;
  var o = Util.coerceOutputStream(outStream, fileSize);
  outStream = o.stream;

  var range = new RangeCoder(inStream);
  range.decodeStart();
  var model = new EscModel(range, (fileSize<0) ? 257 : 256);
  var outSize = 0;
  while (outSize !== fileSize) {
    var ch = model.decode();
    if (ch === 256) {
      break; // end of stream;
    }
    outStream.writeByte(ch);
    outSize++;
  }
  range.decodeFinish();
  return o.retval;
};

return EscModel;
});
