if (typeof define !== 'function') { var define = require('amdefine')(module); }
define(['./lib/freeze','./lib/RangeCoder'], function(freeze,RangeCoder) {
    'use strict';
    return freeze({
        version: "0.0.1",
        RangeCoder: RangeCoder
    });
});
