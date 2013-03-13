if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/DefSumModel','./lib/Dmc','./lib/MTFModel','./lib/Huffman','./lib/Lzjb','./lib/Lzp3','./lib/RangeCoder','./lib/Simple'], function(freeze,DefSumModel,Dmc,MTFModel,Huffman,Lzjb,Lzp3,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // models and coder
        DefSumModel: DefSumModel,
        MTFModel: MTFModel,
        Huffman: Huffman,
        // compression methods
        Dmc: Dmc,
        Lzjb: Lzjb,
        Lzp3: Lzp3,
        Simple: Simple
    });
});
