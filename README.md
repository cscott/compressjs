# dmcjs

`dmcjs` is a fast pure JavaScript implementation of
[Dynamic Markov Compression](http://en.wikipedia.org/wiki/Dynamic_Markov_Compression) and decompression.
`dmcjs` is written by C. Scott Ananian.
The Range Coder used is a port of Michael Schindler's C range coder,
found at http://www.compressconsult.com/rangecoder.

## How to install

```
npm install dmcjs
```
or
```
volo add cscott/dmcjs
```

This package uses
[Typed Arrays](https://developer.mozilla.org/en-US/docs/JavaScript/Typed_arrays)
and so requires node.js >= 0.5.5.  Full browser compatibility table
is available at [caniuse.com](http://caniuse.com/typedarrays); briefly:
IE 10, Firefox 4, Chrome 7, or Safari 5.1.

## Testing

```
npm install
npm test
```

## Usage

There is a binary available in bin:
```
$ bin/dmcjs --help
$ echo "Test me" | bin/dmcjs -z > test.dmc
$ bin/dmcjs -d test.dmc
Test me
```

From JavaScript:
```
var dmcjs = require('dmcjs');
var data = new Buffer('Example data', 'utf8');
var compressed = dmcjs.compressFile(data);
var uncompressed = dmcjs.uncompressFile(compressed);
// convert from array back to string
var data2 = new Buffer(uncompressed).toString('utf8');
console.log(data2);
```
There is a streaming interface as well.

See the tests in the `tests/` directory for further usage examples.

## Documentation

`require('dmcjs')` returns a `dmcjs` object.  It contains two main
methods.  The first is a function accepting one, two or three parameters:

`dmcjs.compressFile = function(input, [output], [Number compressionLevel])`

The `input` argument can be a "stream" object (which must implement the
`readByte` method), or a `Uint8Array`, `Buffer`, or array.

If you omit the second argument, `compressFile` will return a JavaScript
array containing the byte values of the compressed data.  If you pass
a second argument, it must be a "stream" object (which must implement the
`writeByte` method).

The third argument may be omitted, or a number between 1 and 9 indicating
a compression level (1 being largest/fastest compression and 9 being
smallest/slowest compression).  The default is `1`. `6` is about twice
as slow but creates 10% smaller files.

The second exported method is a function accepting one or two parameters:

`dmcjs.decompressFile = function(input, [output])`

The `input` parameter is as above.

If you omit the second argument, `decompressFile` will return a
`Uint8Array`, `Buffer` or JavaScript array with the decompressed
data, depending on what your platform supports.  For most modern
platforms (modern browsers, recent node.js releases) the returned
value will be a `Uint8Array`.

If you provide the second argument, it must be a "stream", implementing
the `writeByte` method.

## Related articles and projects

* http://en.wikipedia.org/wiki/Dynamic_Markov_Compression Wikipedia article on DMC
* http://www.cs.uvic.ca/~nigelh/Publications/DMC.pdf Original DMC paper
* http://www.compressconsult.com/rangecoder/ Range Coder implementation in C

## Other JavaScript compressors

* https://github.com/cscott/lzjb LZJB
* https://github.com/cscott/lzma-purejs LZMA
* https://github.com/cscott/seek-bzip Bzip2 (random-access decompression)

## License (GPLv2)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see http://www.gnu.org/licenses/.
