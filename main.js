if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/DefSumModel','./lib/EscModel','./lib/Huffman','./lib/Lzjb','./lib/Lzp3','./lib/RangeCoder','./lib/Simple'], function(freeze,DefSumModel,EscModel,Huffman,Lzjb,Lzp3,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // models and coder
        DefSumModel: DefSumModel,
        EscModel: EscModel,
        Huffman: Huffman,
        // compression methods
        Lzjb: Lzjb,
        Lzp3: Lzp3,
        Simple: Simple
    });
});
