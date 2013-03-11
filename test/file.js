var assert = require("assert");
var dmcjs = require('../');
var fs = require('fs');

var testRoundTrip = function(cmp, level, filename) {
    var referenceData = fs.readFileSync('test/'+filename+'.ref');
    var data = cmp.compressFile(referenceData, null, level);
    // convert to buffer
    data = new Buffer(data);
    // round trip
    var data2 = cmp.decompressFile(data);
    // convert to buffer
    data2 = new Buffer(data2);
    assert.ok(referenceData.toString('hex') === data2.toString('hex'));
};

// test round-trip encode/decode for all compression variants
ALL_LEVELS=[null, 1, 2, 3, 4, 5, 6, 7, 8, 9];
[{name:"simple", cmp:dmcjs.Simple, levels:[null]},
 {name:"lzjb-style", cmp:dmcjs.Lzjb, levels:[9]},
 {name:"huffman", cmp:dmcjs.Huffman, levels:[null]},
 {name:"lzp3(ish)", cmp:dmcjs.Lzp3, levels:[null]}].forEach(function(compressor) {
     describe(compressor.name+" round-trip encode/decode", function() {
         compressor.levels.forEach(function(level) {
             var desc = (level===null) ? 'default' : ('-'+level);
             describe("compression level "+desc, function() {
                 ['sample0', 'sample1', 'sample2', 'sample3', 'sample4','sample5'].forEach(function(f) {
                     it('should correctly round-trip '+f, function() {
                         testRoundTrip(compressor.cmp, level, f);
                     });
                 });
             });
         });
     });
 });
