if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/Context1Model','./lib/DefSumModel','./lib/FenwickModel','./lib/MTFModel','./lib/NoModel','./lib/Huffman','./lib/Dmc','./lib/Lzjb','./lib/Lzp3','./lib/RangeCoder','./lib/Simple'], function(freeze,Context1Model,DefSumModel,FenwickModel,MTFModel,NoModel,Huffman,Dmc,Lzjb,Lzp3,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // models and coder
        Context1Model: Context1Model,
        DefSumModel: DefSumModel,
        FenwickModel: FenwickModel,
        MTFModel: MTFModel,
        NoModel: NoModel,
        Huffman: Huffman,
        // compression methods
        Dmc: Dmc,
        Lzjb: Lzjb,
        Lzp3: Lzp3,
        Simple: Simple
    });
});
