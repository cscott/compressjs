/* Implementation of LZP3(ish), with an adaptive huffman code (instead of
 * LZP3's original static huffman code.)
 * See: http://www.cbloom.com/papers/lzp.pdf
 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./BitStream', './DeflateDistanceModel', './DefSumModel', './MTFModel', './Huffman', './NoModel', './RangeCoder', './Stream', './Util'],function(BitStream, DeflateDistanceModel, DefSumModel, MTFModel, Huffman, NoModel, RangeCoder, Stream, Util){

var Lzp3 = Object.create(null);

// use huffman coder (fast) or else use range coder (slow)
var USE_HUFFMAN_CODE = false;
// use deferred-sum model, which is supposed to be faster (but compresses worse)
var USE_DEFSUM = false;
// when to give up attempting to model the length
var LENGTH_MODEL_CUTOFF = 256;
var ESC_MAX_PROB = 0xFF;

// Constants was used for compress/decompress function.
var CTXT4_TABLE_SIZE = 1 << 16;
var CTXT3_TABLE_SIZE = 1 << 12;
var CTXT2_TABLE_SIZE = 1 << 16;
var CONTEXT_LEN = 4;
var LOG_WINDOW_SIZE = 16;
var WINDOW_SIZE = 1 << LOG_WINDOW_SIZE;
var MAX_MATCH_LEN = WINDOW_SIZE-1;

var MAX32 = 0xFFFFFFFF;
var MAX24 = 0x00FFFFFF;
var MAX16 = 0x0000FFFF;
var MAX8  = 0x000000FF;


var Window = function() {
  this.buffer = Util.makeBuffer(WINDOW_SIZE);
  this.pos = 0;
  // context-4 hash table.
  this.ctxt4 = new Uint32Array(CTXT4_TABLE_SIZE);
  // context-3 hash table
  this.ctxt3 = new Uint32Array(CTXT3_TABLE_SIZE);
  // context-2 table (not really a hash any more)
  this.ctxt2 = new Uint32Array(CTXT2_TABLE_SIZE);
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
Window.prototype.context = function(pos, n) {
  var c = 0, i;
  pos = (pos - n) & (WINDOW_SIZE-1);
  for (i=0; i<n; i++) {
    c = (c << 8) | this.buffer[pos++];
    if (pos >= WINDOW_SIZE) { pos = 0; }
  }
  return c;
};
// if matchLen !== 0, update the index; otherwise get index value.
Window.prototype.getIndex = function(s, matchLen) {
  var c = this.context(s, 4);
  // compute context hashes
  var h4 = ((c>>>15) ^ c) & (CTXT4_TABLE_SIZE-1);
  var h3 = ((c>>>11) ^ c) & (CTXT3_TABLE_SIZE-1);
  var h2 = c & MAX16;
  // check order-4 context
  var p = 0, checkc;
  // only do context confirmation if matchLen==0 (that is, if we're not just
  // doing an update)
  if (matchLen===0) {
    p = this.ctxt4[h4];
    if (p !== 0 && c !== this.context(p-1, 4)) {
      p = 0; // context confirmation failed
    }
    if (p === 0) {
      // check order-3 context
      p = this.ctxt3[h3];
      if (p !== 0 && (c & MAX24) !== this.context(p-1, 3)) {
        p = 0; // context confirmation failed
      }
      if (p === 0) {
        // check order-2 context
        p = this.ctxt2[h2];
        if (p !== 0 && (c && MAX16) !== this.context(p-1, 2)) {
          p = 0; // context confirmation failed
        }
      }
    }
  }
  // update context index
  if (matchLen) { matchLen--; }
  this.ctxt4[h4] = this.ctxt3[h3] = this.ctxt2[h2] =
    (s | (matchLen << LOG_WINDOW_SIZE)) + 1;
  // return lookup result.
  return p;
};

var Context1Model = function(modelFactory, alphabetSize) {
  var i;
  this.literalModel = [];
  // even if there's an EOF symbol, we don't need a context for it!
  for (i=0; i<256; i++) {
    this.literalModel[i] = modelFactory(alphabetSize);
  }
};
Context1Model.prototype.encode = function(context, ch) {
  this.literalModel[context].encode(ch);
};
Context1Model.prototype.decode = function(context) {
  return this.literalModel[context].decode();
};

/**
 * Compress using modified LZP3 algorithm.  Instead of using static
 * huffman coding, we use an adaptive huffman code.
 */
Lzp3.compressFile = function(inStream, outStream, props) {
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

  // sliding window & hash table
  var window = new Window();

  var coderFactory, sparseCoderFactory, flush;

  if (USE_HUFFMAN_CODE) {
    // huffman contexts
    outStream.writeByte(0x80); // mark that this is huffman coded.
    var bitstream = new BitStream(outStream);
    flush = bitstream.flush.bind(bitstream);
    coderFactory = Huffman.factory(bitstream, MAX16);
    sparseCoderFactory = NoModel.factory(bitstream);

  } else { // range encoder
    var range = new RangeCoder(outStream);
    range.encodeStart(0x00, 0); // 0x00 == range encoded

    coderFactory = MTFModel.factory(range, ESC_MAX_PROB);
    if (USE_DEFSUM) {
      coderFactory = DefSumModel.factory(range, false /* encoder */);
    }
    // switch sparseCoderFactory to a NoModel when size > cutoff
    var noCoderFactory = NoModel.factory(range);
    sparseCoderFactory = function(size) {
      if (USE_DEFSUM && size > LENGTH_MODEL_CUTOFF) {
        return noCoderFactory(size);
      }
      return coderFactory(size);
    };
    flush = function() { range.encodeFinish(); };
  }

  var huffLiteral= new Context1Model(coderFactory, (fileSize<0) ? 257 : 256);
  var huffLen = new DeflateDistanceModel(MAX_MATCH_LEN+1, 1,
                                         coderFactory, sparseCoderFactory);

  var inSize = 0, s;
  while (inSize !== fileSize) {
    var ch = inStream.readByte();
    s = window.pos;
    var p = window.getIndex(s, 0);
    if (p !== 0) {
      // great, a match! how long is it?
      p--; // p=0 is used for 'not here'. p=1 really means WINDOW_SIZE
      var prevMatchLen = (p >>> LOG_WINDOW_SIZE) + 1;
      var matchLen = 0;
      while (window.get(p + matchLen) === ch && matchLen < MAX_MATCH_LEN) {
        matchLen++;
        window.put(ch);
        ch = inStream.readByte();
      }
      // code match length; match len = 0 means "literal"
      // use "extra state" -1 to mean "same as previous match length"
      if (prevMatchLen===matchLen) {
        huffLen.encode(-1);
      } else {
        huffLen.encode(matchLen);
      }
      // update hash with this match
      window.getIndex(s, matchLen);
      inSize += matchLen;
    }
    // always encode a literal after a match
    var context1 = window.get(window.pos-1);
    if (ch===Stream.EOF) {
      if (fileSize < 0) {
        huffLiteral.encode(context1, 256);
      }
      break;
    }
    huffLiteral.encode(context1, ch);
    window.put(ch);
    inSize++;
  }
  if (flush) flush();

  return o.retval;
};

/**
 * Decompress using modified LZJB algorithm.
 */
Lzp3.decompressFile = function(inStream, outStream) {
  inStream = Util.coerceInputStream(inStream);
  var fileSize = Util.readUnsignedNumber(inStream) - 1;
  var o = Util.coerceOutputStream(outStream, fileSize);
  outStream = o.stream;
  var flags = inStream.readByte();
  var use_huffman_code = !!(flags & 0x80);

  // sliding window & hash table
  var window = new Window();

  var coderFactory, sparseCoderFactory, finish;

  if (use_huffman_code) {
    // huffman contexts
    var bitstream = new BitStream(inStream);
    coderFactory = Huffman.factory(bitstream, MAX16);
    sparseCoderFactory = NoModel.factory(bitstream);
  } else { // range encoder
    var range = new RangeCoder(inStream);
    range.decodeStart(true/* skip initial read */);
    coderFactory = MTFModel.factory(range, ESC_MAX_PROB);
    if (USE_DEFSUM) {
      coderFactory = DefSumModel.factory(range, true /* decoder */);
    }
    // switch sparseCoderFactory to a NoModel when size > cutoff
    var noCoderFactory = NoModel.factory(range);
    sparseCoderFactory = function(size) {
      if (USE_DEFSUM && size > LENGTH_MODEL_CUTOFF) {
        return noCoderFactory(size);
      }
      return coderFactory(size);
    };
    finish = function() { range.decodeFinish(); };
  }

  var huffLiteral= new Context1Model(coderFactory, (fileSize<0) ? 257 : 256);
  var huffLen = new DeflateDistanceModel(MAX_MATCH_LEN+1, 1,
                                         coderFactory, sparseCoderFactory);

  var s, ch, outSize = 0;
  while (outSize !== fileSize) {
    s = window.pos;
    var p = window.getIndex(s, 0);
    if (p !== 0) {
      p--; // p=0 is used for 'not here'. p=1 really means WINDOW_SIZE
      var prevMatchLen = (p >>> LOG_WINDOW_SIZE) + 1;
      var matchLen = huffLen.decode(), i;
      if (matchLen < 0) { matchLen = prevMatchLen; }
      // copy characters!
      for (i=0; i<matchLen; i++) {
        ch = window.get(p + i);
        outStream.writeByte(window.put(ch));
      }
      window.getIndex(s, matchLen);
      outSize += matchLen;
    }
    // literal always follows match (or failed match)
    if (outSize === fileSize) {
      break; // EOF
    }
    var context1 = window.get(window.pos-1);
    ch = huffLiteral.decode(context1);
    if (ch === 256) {
      break; // EOF
    }
    outStream.writeByte(window.put(ch));
    outSize++;
  }
  if (finish) finish();
  return o.retval;
};


return Lzp3;
});
