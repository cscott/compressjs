if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/Huffman','./lib/Lzjb','./lib/RangeCoder','./lib/Simple'], function(freeze,Huffman,Lzjb,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // compression methods
        Huffman: Huffman,
        Simple: Simple,
        Lzjb: Lzjb
    });
});
