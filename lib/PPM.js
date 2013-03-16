/** Particularly simple-minded implementation of PPM compression. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./Context1Model','./FenwickModel','./RangeCoder','./Util'], function(Context1Model,FenwickModel,RangeCoder,Util) {

  var MAX_CONTEXT = 4;
  var LOG_WINDOW_SIZE = 16;
  var WINDOW_SIZE = 1 << LOG_WINDOW_SIZE;

  var Window = function() {
    this.buffer = Util.makeBuffer(WINDOW_SIZE);
    this.pos = 0;
    // initial context
    this.put(0x63); this.put(0x53); this.put(0x61); this.put(0x20);
  };
  Window.prototype.put = function(_byte) {
    this.buffer[this.pos++] = _byte;
    if (this.pos >= WINDOW_SIZE) { this.pos = 0; }
    return _byte;
  };
  Window.prototype.get = function(pos) {
    return this.buffer[pos & (WINDOW_SIZE-1)];
  };
  // the context ending just before 'pos'
  Window.prototype.context = function(pos, n) {
    var c = [], i;
    pos = (pos - n) & (WINDOW_SIZE-1);
    for (i=0; i<n; i++) {
      c.push(this.buffer[pos++]);
      if (pos >= WINDOW_SIZE) { pos = 0; }
    }
    return String.fromCharCode.apply(String, c);
  };

  var DMM_INCREMENT = 0x100, DMM_MAX_PROB = 0xFF00;

  var PPM = function(coder, size) {
    this.window = new Window();
    this.contexts = Object.create(null);
    this.c1coder = new Context1Model(FenwickModel.factory(coder, 0xFF00, 0x100),
                                     256, size);

    var DenseMTFModel = function() {
      this.sym = [size];
      this.prob= [0, DMM_INCREMENT];
      this.refcount = 0;
    };
    DenseMTFModel.prototype._rescale = function() {
      var seenSyms = this.sym.length;
      var i, j, total=0;
      var noEscape = true;
      for(i=0, j=0; i<seenSyms; i++) {
        var sym = this.sym[i];
        var sy_f = this.prob[i+1] - this.prob[i];
        sy_f >>>= 1;
        if (sy_f > 0) {
          if (sym === size) {
            noEscape = false;
          }
          this.sym[j] = sym;
          this.prob[j++] = total;
          total += sy_f;
        }
      }
      this.prob[j] = total;
      seenSyms = this.sym.length = j;
      this.prob.length = seenSyms + 1;
      // don't allow escape to go to zero prob if we still need it
      if (noEscape && seenSyms < size) {
        total = this._update(size/*escape*/, seenSyms/*at end*/, 0, 1);
      }
      return total;
    };
    DenseMTFModel.prototype.update = function(symbol, incr) {
      // find symbol
      var i=0;
      for (i=0; i<this.sym.length; i++) {
        if (this.sym[i] === symbol) {
          return this._update(symbol, i, this.prob[i+1] - this.prob[i], incr);
        }
      }
      // symbol escaped
      return this._update(symbol, i, 0, incr);
    };
    DenseMTFModel.prototype._update = function(symbol, index, sy_f, incr) {
      var seenSyms = this.sym.length;
      var j, tot_f;
      // move this symbol to the end
      for (j=index; j<seenSyms-1; j++) {
        this.sym[j] = this.sym[j+1];
        this.prob[j] = this.prob[j+1] - sy_f;
      }
      // "method D" -- if we add a new escaped symbol, escape & the symbol
      // both increase by 1/2.
      if (index < seenSyms) {
        this.sym[j] = symbol;
        this.prob[j] = this.prob[j+1] - sy_f;
        // increase frequency for this symbol, and total freq at same time
        this.prob[seenSyms] = tot_f =
          this.prob[seenSyms] + incr;
      } else { // add to the end
        tot_f = this.prob[seenSyms];
        this.sym[index] = symbol;
        this.prob[index] = tot_f;
        tot_f += incr;
        this.prob[++seenSyms] = tot_f;
        // remove probability of escape if table just filled up
        if (this.sym.length > size) {
          for (i=0; i<seenSyms; i++) {
            if (size === this.sym[i]) {
              // found it.
              this._update(size, i, this.prob[i+1] - this.prob[i], -1);
              this.sym.length--;
              this.prob.length--;
              tot_f = this.prob[this.prob.length-1];
            }
          }
        }
      }
      if (tot_f >= DMM_MAX_PROB) { tot_f = this._rescale(); }
      return tot_f;
    };
    DenseMTFModel.prototype.encode = function(symbol) {
      // look for symbol, from most-recent to oldest
      var i, sy_f, lt_f, tot_f, seenSyms = this.sym.length;
      for (i=seenSyms-1; i>=0; i--) {
        if (symbol === this.sym[i]) {
          // ok, found it.
          lt_f = this.prob[i];
          sy_f = this.prob[i + 1] - lt_f;
          tot_f = this.prob[seenSyms];
          coder.encodeFreq(sy_f, lt_f, tot_f);
          if (symbol === size) { // only update table for escapes
            this._update(symbol, i, sy_f, DMM_INCREMENT/2);
            return false; // escape.
          } // otherwise we'll do update later
          return true; // encoded character!
        }
      }
      // couldn't find this symbol.  encode as escape.
      return this.encode(size);
    };
    DenseMTFModel.prototype.decode = function() {
      var seenSyms = this.sym.length;
      var tot_f = this.prob[seenSyms];
      var prob = coder.decodeCulFreq(tot_f);
      // we're expecting to find the probability near the "most recent" side
      // of our array
      var i;
      for (i=seenSyms-1; i>=0; i--) {
        if (this.prob[i] <= prob /*&& prob < this.prob[i+1]*/)
          break;
      }
      console.assert(i>=0);
      var symbol = this.sym[i];
      var lt_f = this.prob[i];
      var sy_f = this.prob[i + 1] - lt_f;
      coder.decodeUpdate(sy_f, lt_f, tot_f);
      // defer update
      if (symbol < size) { return symbol; }
      // an escape
      this._update(symbol, i, sy_f, DMM_INCREMENT/2);
      return -1;
    };
    this.newContext = function(initialSymbol) {
      return new DenseMTFModel();
    };
  };
  PPM.prototype.update = function(symbol, contextString, matchLevel) {
    // slide up the contexts, updating them
    var model, c, cc, increment = DMM_INCREMENT;
    for (c=matchLevel; c <= MAX_CONTEXT; c++) {
      if (c > 1) {
        cc = contextString.slice(MAX_CONTEXT - c);
        model = this.contexts[cc];
        model.update(symbol, increment);
        model.refcount++;
      }
      increment = DMM_INCREMENT / 2;
    }
    // now garbage-collect old contexts
    contextString = this.window.context(this.window.pos + MAX_CONTEXT,
                                            MAX_CONTEXT);
    for (c=MAX_CONTEXT; c>1; c--) {
      cc = contextString.slice(0, c);
      model = this.contexts[cc];
      if (!model) { continue; /* should only happen during initial startup */}
      if ((--model.refcount) <= 0) {
        delete this.contexts[cc];
      }
    }
    // ok, advance window.
    this.window.put(symbol);
  };
  PPM.prototype.decode = function() {
    var contextString = this.window.context(this.window.pos, MAX_CONTEXT);
    var model, c, cc, symbol;
    for (c=MAX_CONTEXT; c>1; c--) {
      cc = contextString.slice(MAX_CONTEXT - c);
      model = this.contexts[cc];
      if (model) {
        symbol = model.decode();
        if (symbol >= 0) {
          this.update(symbol, contextString, c);
          return symbol;
        }
      } else {
        model = this.contexts[cc] = this.newContext();
      }
    }
    // still no match
    symbol = this.c1coder.decode(contextString.charCodeAt(MAX_CONTEXT-1));
    this.update(symbol, contextString, c);
    return symbol;
  };
  PPM.prototype.encode = function(symbol) {
    var contextString = this.window.context(this.window.pos, MAX_CONTEXT);
    var c;
    for (c=MAX_CONTEXT; c>1; c--) {
      var cc = contextString.slice(MAX_CONTEXT - c);
      var model = this.contexts[cc];
      if (model) {
        var success = model.encode(symbol);
        if (success) {
          this.update(symbol, contextString, c);
          return;
        }
      } else {
        model = this.contexts[cc] = this.newContext();
      }
    }
    // fall back to context-1
    this.c1coder.encode(symbol, contextString.charCodeAt(MAX_CONTEXT-1));
    this.update(symbol, contextString, c);
    return;
  };

  PPM.MAGIC = 'ppm1';
  PPM.compressFile = Util.compressFileHelper(PPM.MAGIC, function(inStream, outStream, fileSize, props, finalByte) {
    var range = new RangeCoder(outStream);
    range.encodeStart(finalByte, 1);
    var model = new PPM(range, (fileSize<0) ? 257 : 256);
    Util.compressWithModel(inStream, fileSize, model);
    range.encodeFinish();
  }, true);
  PPM.decompressFile = Util.decompressFileHelper(PPM.MAGIC, function(inStream, outStream, fileSize) {
    var range = new RangeCoder(inStream);
    range.decodeStart(true/*we already read the 'free' byte*/);
    var model = new PPM(range, (fileSize<0) ? 257 : 256);
    Util.decompressWithModel(outStream, fileSize, model);
    range.decodeFinish();
  });

  return PPM;
});
