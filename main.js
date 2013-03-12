if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/EscModel','./lib/Huffman','./lib/Lzjb','./lib/Lzp3','./lib/RangeCoder','./lib/Simple'], function(freeze,EscModel,Huffman,Lzjb,Lzp3,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // compression methods
        EscModel: EscModel,
        Huffman: Huffman,
        Simple: Simple,
        Lzjb: Lzjb,
        Lzp3: Lzp3
    });
});
