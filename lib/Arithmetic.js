const ariCoding = require('arithmetic-coding');

if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([],function() {

var Arithmetic = function() {}

Arithmetic.compressFile = ariCoding.encodeFromBuffer;
Arithmetic.decompressFile = ariCoding.decodeFromBuffer

return Arithmetic;
});