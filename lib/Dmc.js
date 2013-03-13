/** Implementation of Dynamic Markov Compression, using byte-oriented
 *  nodes/transitions. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./EscModel', './RangeCoder', './Stream', './Util'],function(EscModel, RangeCoder, Stream, Util){

// nm = no model cloning, MAX_TRANS_CNT=0xFF, MAX_MODEL_PROB=0xFFFF
// nm2 = "                            0xFFFF                 0xFFFF
// nm3 = "                             0xFFF                 0x0FFF
// nm4 = "                            0xFFFF                   0xFF
// cl1 = model cloning, MAX_TRANS_CNT=0xFFFF  MAX_MODEL_PROB=0xFF
// cl2 = model cloning, MAX_TRANS_CNT=  0xFF  MAX_MODEL_PROB=0xFF
// cl3 = model cloning, MAX_TRANS_CNT=0xFFFF  MAX_MODEL_PROB=0xFFFF
var MAX_TRANS_CNT = 0xFFFF;
var DEFAULT_MIN_CNT1 = 8;
var DEFAULT_MIN_CNT2 = 128;
var MAX_MODEL_PROB = 0xFF;
var CLONE_MODELS=false;
var PRINT_STATS=false; // for quick benchmarking

// XXX need to limit growth of model (throw away and retrain if model
//     gets too large)

var Dmc = Object.create(null);

var MarkovNode = function(coder, size, optModel) {
  this.out = [];
  this.model = optModel ? optModel.clone() :
    new EscModel(coder, size, MAX_MODEL_PROB);
  this.count = new Uint16Array(size);
  this.sum = 0;
};
MarkovNode.prototype.clone = function(coder, size) {
  var i;
  var newNode = new MarkovNode(coder, size, CLONE_MODELS ? this.model : null);
  for (i=0; i<size; i++) {
    newNode.out[i] = this.out[i];
  }
  return newNode;
};

var MarkovModel = function(coder, size, MIN_CNT1, MIN_CNT2) {
  var i, j;
  // initial model is 'size' states, completely linked.
  this.coder = coder;
  this.size = size;
  this.MIN_CNT1 = MIN_CNT1 || DEFAULT_MIN_CNT1;
  this.MIN_CNT2 = MIN_CNT2 || DEFAULT_MIN_CNT2;
  this.nodes = [];
  for (i=0; i<size; i++) {
    this.nodes[i] = new MarkovNode(coder, size);
  }
  // now link nodes
  for (i=0; i<size; i++) {
    for (j=0; j<size; j++) {
      this.nodes[i].out[j] = this.nodes[j];
    }
  }
  // select an arbitrary node as the start state.
  this.current = this.nodes[0];
};
MarkovModel.prototype.maybeSplit = function(from, symbol, to) {
  var trans_cnt = from.count[symbol];
  var next_cnt = to.sum;
  var i;
  if ( (trans_cnt <= this.MIN_CNT1) ||
       (next_cnt - trans_cnt <= this.MIN_CNT2) ) {
    return to; // no split
  }

  // split this guy!
  var newNode = to.clone(this.coder, this.size);
  this.nodes.push(newNode);
  from.out[symbol] = newNode;
  // distribute transition counts among new and cloned node
  newNode.sum = to.sum = 0;
  for (i=0; i<this.size; i++) {
    newNode.count[i] = to.count[i] * trans_cnt / next_cnt;
    newNode.sum += newNode.count[i];
    to.count[i] -= newNode.count[i];
    to.sum += to.count[i];
  }

  return newNode;
};
MarkovModel.prototype.encode = function(symbol) {
  var from = this.current;
  from.model.encode(symbol);
  var to = from.out[symbol];
  if (from.count[symbol] !== MAX_TRANS_CNT) {
      from.count[symbol]++;
      from.sum++;
  }
  this.current = this.maybeSplit(from, symbol, to);
};
MarkovModel.prototype.decode = function() {
  var from = this.current;
  var symbol = from.model.decode();
  var to = from.out[symbol];
  if (from.count[symbol] !== MAX_TRANS_CNT) {
      from.count[symbol]++;
      from.sum++;
  }
  this.current = this.maybeSplit(from, symbol, to);
  return symbol;
};

Dmc.compressFile = function(inStream, outStream, props) {
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

  props = props || {};
  var MIN_CNT1 = (+props.m) || DEFAULT_MIN_CNT1;
  var MIN_CNT2 = (+props.n) || DEFAULT_MIN_CNT2;
  Util.writeUnsignedNumber(outStream, MIN_CNT1);
  Util.writeUnsignedNumber(outStream, MIN_CNT2);

  var range = new RangeCoder(outStream);
  range.encodeStart(0xCA, 0);

  var mm = new MarkovModel(range, (fileSize<0) ? 257 : 256,
                           MIN_CNT1, MIN_CNT2);
  var inSize = 0;
  while (inSize !== fileSize) {
    var ch = inStream.readByte();
    if (ch===Stream.EOF) {
      mm.encode(256); // end of stream
      break;
    }
    mm.encode(ch);
    inSize++;
  }
  var outSize = range.encodeFinish();
  if (PRINT_STATS) {
    console.log('M1', mm.MIN_CNT1, 'M2', mm.MIN_CNT2,
                'states', mm.nodes.length, 'size', outSize);
  }
  return o.retval;
};

Dmc.decompressFile = function(inStream, outStream) {
  inStream = Util.coerceInputStream(inStream);
  var fileSize = Util.readUnsignedNumber(inStream) - 1;
  var o = Util.coerceOutputStream(outStream, fileSize);
  outStream = o.stream;

  var MIN_CNT1 = Util.readUnsignedNumber(inStream);
  var MIN_CNT2 = Util.readUnsignedNumber(inStream);

  var range = new RangeCoder(inStream);
  range.decodeStart();

  var mm = new MarkovModel(range, (fileSize<0) ? 257 : 256,
                           MIN_CNT1, MIN_CNT2);
  var outSize = 0;
  while (outSize !== fileSize) {
    var ch = mm.decode();
    if (ch===256) {
      break; // EOF
    }
    outStream.writeByte(ch);
    outSize++;
  }
  range.decodeFinish();

  return o.retval;
};

return Dmc;
});
