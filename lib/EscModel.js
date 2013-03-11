/** Simple range coding model w/ escape, suitable for sparse symbol sets. */
// xxx could do better encoding escaped chars by excluding the already-present
//     chars.
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./Util'],function(Util){

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
        symbol = this.coder.decodeCulFreq(this.numSyms);
        this.coder.decodeUpdate(1, symbol, this.numSyms);
        this._update(symbol, this.seenSyms);
    }
    return symbol;
};
EscModel.prototype.encode = function(symbol) {
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

return EscModel;
});
