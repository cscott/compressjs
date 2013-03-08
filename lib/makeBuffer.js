if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([],function(){
  'use strict';

  // typed array / Buffer compatibility.
  var makeBuffer = function(len) {
      var b = [], i;
      for (i=0; i<len; i++) { b[i] = 0; }
      return b;
  };
  if (typeof(Uint8Array) !== 'undefined') {
    makeBuffer = function(len) { return new Uint8Array(len); };
  } else if (typeof(Buffer) !== 'undefined') {
    makeBuffer = function(len) {
        var b = new Buffer(len);
        b.fill(0); // zero-fill, for consistency
        return b;
    };
  }

  return makeBuffer;
});
