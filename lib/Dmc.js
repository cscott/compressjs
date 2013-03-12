/** Implementation of Dynamic Markov Compression, using byte-oriented
 *  nodes/transitions. */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./EscModel', './RangeCoder', './Util'],function(EscModel, RangeCoder, Util){

var Dmc = Object.create(null);

var MarkovNode = function(coder, size) {
  this.out = [];
  this.model = new EscModel(coder, size);
};

var MarkovModel = function(coder, size) {
  var i, j;
  // initial model is 'size' states, completely linked.
  this.coder = coder;
  this.size = size;
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
MarkovModel.prototype.encode = function(symbol) {
  var node = this.current;
  node.model.encode(symbol);
  this.current = node.out[symbol];
  // XXX track statistics and split nodes
};
MarkovModel.prototype.decode = function() {
  var node = this.current;
  var symbol = node.model.decode();
  this.current = node.out[symbol];
  // XXX track statistics and split nodes
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

  var range = new RangeCoder(outStream);
  range.encodeStart(0xCA, 0);

  var mm = new MarkovModel(range, (fileSize<0) ? 257 : 256);
  var inSize = 0;
  while (inSize !== fileSize) {
    var ch = inStream.readByte();
    if (ch===Util.EOF) {
      mm.encode(256); // end of stream
      break;
    }
    mm.encode(ch);
    inSize++;
  }
  range.encodeFinish();

  return o.retval;
};

Dmc.decompressFile = function(inStream, outStream) {
  inStream = Util.coerceInputStream(inStream);
  var fileSize = Util.readUnsignedNumber(inStream) - 1;
  var o = Util.coerceOutputStream(outStream, fileSize);
  outStream = o.stream;

  var range = new RangeCoder(inStream);
  range.decodeStart();

  var mm = new MarkovModel(range, (fileSize<0) ? 257 : 256);
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
