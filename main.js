if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/BWT','./lib/Context1Model','./lib/DefSumModel','./lib/FenwickModel','./lib/MTFModel','./lib/NoModel','./lib/Huffman','./lib/RangeCoder','./lib/Dmc','./lib/Lzjb','./lib/Lzp3','./lib/PPM','./lib/Simple'], function(freeze,BWT,Context1Model,DefSumModel,FenwickModel,MTFModel,NoModel,Huffman,RangeCoder,Dmc,Lzjb,Lzp3,PPM,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        // transforms
        BWT: BWT,
        // models and coder
        Context1Model: Context1Model,
        DefSumModel: DefSumModel,
        FenwickModel: FenwickModel,
        MTFModel: MTFModel,
        NoModel: NoModel,
        Huffman: Huffman,
        RangeCoder: RangeCoder,
        // compression methods
        Dmc: Dmc,
        Lzjb: Lzjb,
        Lzp3: Lzp3,
        PPM: PPM,
        Simple: Simple
    });
});
