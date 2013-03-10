if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/Lzjb','./lib/RangeCoder','./lib/Simple'], function(freeze,Lzjb,RangeCoder,Simple) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder,
        // compression methods
        Simple: Simple,
        Lzjb: Lzjb
    });
});
