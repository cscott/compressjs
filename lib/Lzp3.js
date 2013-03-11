/* Implementation of LZP3(ish), with an adaptive huffman code (instead of
 * LZP3's original static huffman code.)
 * See: http://www.cbloom.com/papers/lzp.pdf
 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./EscModel', './Huffman', './RangeCoder', './Util'],function(EscModel, Huffman, RangeCoder, Util){

var Lzp3 = Object.create(null);

var USE_HUFFMAN_CODE = false; // use huffman or use range coder

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

var LengthModel = function(Huff, sparseLimit, writeBit, readBit) {
  // length of length
  this.huffLenLen = new Huff(19);
  var writeNBits = function(n) {
    return function(val) {
      var i;
      for (i=n-1; i>=0; i--) {
        writeBit(val & (1<<i));
      }
    };
  };
  var readNBits = function(n) {
    return function() {
      var i, val=0;
      for (i=0; i<n; i++) {
        val <<= 1;
        if (readBit()) { val |= 1; }
      }
      return val;
    };
  };
  // set of huffman trees for different lengths
  this.huffLen = [];
  var i;
  for (i=3; i<=sparseLimit; i++) {
    this.huffLen[i] = new Huff((1<<i) - (1<<(i-1)));
  }
  for ( ; i<=16; i++) {
    // just write the literal bits
    this.huffLen[i] = {
      encode: writeNBits(i-1),
      decode: readNBits(i-1)
    };
  }
};
LengthModel.prototype.encode = function(prevMatchLen, matchLen) {
  if (prevMatchLen===matchLen) {
    return this.huffLenLen.encode(18); // special case "same as before"
  }
  var lenlen = 0;
  while (matchLen >>> lenlen) {
    lenlen++;
  }
  if (matchLen > 2) {
    lenlen++; // special case 2, 3 as well.
  }
  this.huffLenLen.encode(lenlen);
  // now write bits for match length
  if (lenlen > 3) {
    lenlen--; // undo special case for 3 ;)
    this.huffLen[lenlen].encode(matchLen - (1<<(lenlen-1)));
  }
};
LengthModel.prototype.decode = function(prevMatchLen) {
  var lenlen = this.huffLenLen.decode();
  switch(lenlen) {
  case 0: return 0;
  case 1: return 1;
  case 2: return 2;
  case 3: return 3;
  default:
    lenlen--;
    return this.huffLen[lenlen].decode() + (1<<(lenlen-1));
  case 18: return prevMatchLen; // 'same as before'
  }
};
var Context1Model = function(Huff, alphabetSize) {
  var i;
  this.huffLiteral = [];
  // even if there's an EOF symbol, we don't need a context for it!
  for (i=0; i<256; i++) {
    this.huffLiteral[i] = new Huff(alphabetSize);
  }
};
Context1Model.prototype.encode = function(context, ch) {
  this.huffLiteral[context].encode(ch);
};
Context1Model.prototype.decode = function(context) {
  return this.huffLiteral[context].decode();
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

  var Coder;
  var flush, writeBit, sparseLimit;
  if (USE_HUFFMAN_CODE) {
    outStream.writeByte(0x80); // mark that this is huffman coded.
    // huffman contexts
    var bufferByte = 1;
    writeBit = function(b) {
      bufferByte <<= 1;
      if (b) { bufferByte |= 1; }
      if (bufferByte & 0x100) {
        outStream.writeByte(bufferByte & MAX8);
        bufferByte = 1;
      }
    };
    flush = function() {
      while (bufferByte !== 1) {
        writeBit(0);
      }
    };
    sparseLimit = 8;

    Coder = function(size) {
      Huffman.call(this, size);
    };
    Coder.prototype = Object.create(Huffman.prototype);
    Coder.prototype.writeBit = writeBit; // share single writeBit instance
    Coder.prototype.encode = function(symbol) {
      Huffman.prototype.encode.call(this, symbol);
      // rescale while necessary
      if (this.table[this.root].weight > MAX16) {
        this.scale(1);
      }
    };
  } else { // range encoder
    var range = new RangeCoder(outStream);
    range.encodeStart(0x00, 0); // 0x00 == range encoded
    Coder = function(size) {
      EscModel.call(this, range, size, MAX16);
    };
    Coder.prototype = Object.create(EscModel.prototype);
    writeBit = function(_b) { range.encodeBit(_b); };
    flush = function() { range.encodeFinish(); };
    sparseLimit = 16;
  }

  var huffLiteral= new Context1Model(Coder, (fileSize<0) ? 257 : 256);
  var huffLen = new LengthModel(Coder, sparseLimit, writeBit, null);

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
      huffLen.encode(prevMatchLen, matchLen);
      // update hash with this match
      window.getIndex(s, matchLen);
      inSize += matchLen;
    }
    // always encode a literal after a match
    var context1 = window.get(window.pos-1);
    if (ch===Util.EOF) {
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

  var Coder, finish, readBit, sparseLimit;
  if (use_huffman_code) {
    // huffman contexts
    var bufferByte = 0x100;
    readBit = function() {
      if ((bufferByte & 0xFF) === 0) {
        bufferByte = (inStream.readByte() << 1) | 1;
      }
      var bit = (bufferByte & 0x100) ? 1 : 0;
      bufferByte <<= 1;
      return bit;
    };
    sparseLimit = 8;

    Coder = function(size) {
      Huffman.call(this, size);
    };
    Coder.prototype = Object.create(Huffman.prototype);
    Coder.prototype.readBit = readBit; // share single readBit instance
    Coder.prototype.decode = function() {
      var result = Huffman.prototype.decode.call(this);
      // rescale while necessary
      if (this.table[this.root].weight > MAX16) {
        this.scale(1);
      }
      return result;
    };
  } else { // range encoder
    var range = new RangeCoder(inStream);
    range.decodeStart(true/* skip initial read */);
    Coder = function(size) {
      EscModel.call(this, range, size, MAX16);
    };
    Coder.prototype = Object.create(EscModel.prototype);
    readBit = function() { return range.decodeBit(); };
    finish = function() { range.decodeFinish(); };
    sparseLimit = 16;
  }

  var huffLiteral= new Context1Model(Coder, (fileSize<0) ? 257 : 256);
  var huffLen = new LengthModel(Coder, sparseLimit, null, readBit);

  var s, ch, outSize = 0;
  while (outSize !== fileSize) {
    s = window.pos;
    var p = window.getIndex(s, 0);
    if (p !== 0) {
      p--; // p=0 is used for 'not here'. p=1 really means WINDOW_SIZE
      var prevMatchLen = (p >>> LOG_WINDOW_SIZE) + 1;
      var matchLen = huffLen.decode(prevMatchLen), i;
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
