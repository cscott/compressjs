# compressjs

`compressjs` contains fast pure-JavaScript implementations of various
de/compression algorithms, including `bzip2`, Charles Bloom's
[LZP3](http://www.cbloom.com/papers/lzp.pdf),
a modified
[LZJB](http://en.wikipedia.org/wiki/LZJB),
`PPM-D`, and an implementation of
[Dynamic Markov Compression](http://en.wikipedia.org/wiki/Dynamic_Markov_Compression).
`compressjs` is written by C. Scott Ananian.
The Range Coder used is a JavaScript port of
[Michael Schindler's C range coder](http://www.compressconsult.com/rangecoder).
Bits also also borrowed from Yuta Mori's
[SAIS implementation](https://sites.google.com/site/yuta256/sais);
[Eli Skeggs](https://github.com/skeggse/node-bzip),
[Kevin Kwok](https://github.com/antimatter15/bzip2.js),
[Rob Landley](http://www.landley.net/code/bunzip-4.1.c),
[James Taylor](https://bitbucket.org/james_taylor/seek-bzip2/),
and [Matthew Francis](https://code.google.com/p/jbzip2)
for Bzip2 compression and decompression code.
"Bear" wrote the [original JavaScript LZJB](https://code.google.com/p/jslzjb/);
the version here is based on the
[node lzjb module](https://github.com/cscott/lzjb).

## Compression benchmarks
Here are some representative speeds and sizes, on the `test/sample5.ref` input
included in this repository.  Times are with node 0.8.22 on my laptop, but
they should be valid for inter-algorithm comparisons.

<table>
<tr><th>Type</th><th>Level</th><th>Size (bytes)</th><th>Compress time (s)</th><th>Decompress time (s)</th></tr>
<tr><td>bwtc    </td><td>9</td><td> 272997</td><td> 7.47</td><td> 1.04</td></tr>
<tr><td>bzip2   </td><td>9</td><td> 275087</td><td>12.87</td><td> 0.71</td></tr>
<tr><td>ppm     </td><td>-</td><td> 297220</td><td>24.24</td><td>24.94</td></tr>
<tr><td>lzp3    </td><td>-</td><td> 320302</td><td> 1.06</td><td> 1.00</td></tr>
<tr><td>bwtc    </td><td>1</td><td> 333166</td><td> 6.95</td><td> 0.96</td></tr>
<tr><td>bzip2   </td><td>1</td><td> 341615</td><td>12.42</td><td> 0.79</td></tr>
<tr><td>dmc     </td><td>-</td><td> 435835</td><td> 4.03</td><td> 5.33</td></tr>
<tr><td>lzjb    </td><td>9</td><td> 568178</td><td> 1.58</td><td> 1.55</td></tr>
<tr><td>lzjb    </td><td>1</td><td> 607039</td><td> 1.70</td><td> 1.87</td></tr>
<tr><td>context1</td><td>-</td><td> 939098</td><td> 2.88</td><td> 2.51</td></tr>
<tr><td>huffman </td><td>-</td><td>1452055</td><td> 4.13</td><td> 3.56</td></tr>
<tr><td>mtf     </td><td>-</td><td>1470526</td><td> 1.00</td><td> 2.09</td></tr>
<tr><td>fenwick </td><td>-</td><td>1470719</td><td> 1.60</td><td> 1.92</td></tr>
<tr><td>simple  </td><td>-</td><td>1479143</td><td> 0.39</td><td> 1.34</td></tr>
<tr><td>defsum  </td><td>-</td><td>1491107</td><td> 1.68</td><td> 0.81</td></tr>
<tr><td>no      </td><td>-</td><td>2130648</td><td> 0.44</td><td> 0.49</td></tr>
<tr><td>-       </td><td>-</td><td>2130640</td><td>-    </td><td>-    </td></tr>
</table>

## How to install

```
npm install compressjs
```
or
```
volo add cscott/compressjs
```

This package uses
[Typed Arrays](https://developer.mozilla.org/en-US/docs/JavaScript/Typed_arrays)
if available, which are present in node.js >= 0.5.5 and many modern
browsers.  Full browser compatibility table
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
$ bin/compressjs --help
$ echo "Test me" | bin/compressjs -t lzp3 -z > test.lzp3
$ bin/compressjs -t lzp3 -d test.lzp3
Test me
```

The `-t` argument can take a number of different strings to specify
the various compression algorithms available.  Use `--help` to see
the various options.

From JavaScript:
```
var compressjs = require('compressjs');
var algorithm = compressjs.Lzp3;
var data = new Buffer('Example data', 'utf8');
var compressed = algorithm.compressFile(data);
var uncompressed = algorithm.uncompressFile(compressed);
// convert from array back to string
var data2 = new Buffer(uncompressed).toString('utf8');
console.log(data2);
```
There is a streaming interface as well.  Use `Uint8Array` or normal
JavaScript arrays when running in a browser.

See the tests in the `tests/` directory for further usage examples.

## Documentation

`require('compressjs')` returns a `compressjs` object.  Its fields
correspond to the various algorithms implemented, which export one of
two different interfaces, depending on whether it is a "compression
method" or a "model/coder".

### Compression Methods
Compression methods (like `compressjs.Lzp3`) export two methods.
The first is a function accepting one, two or three parameters:

`cmp.compressFile = function(input, [output], [Number compressionLevel] or [props])`

The `input` argument can be a "stream" object (which must implement the
`readByte` method), or a `Uint8Array`, `Buffer`, or array.

If you omit the second argument, `compressFile` will return a JavaScript
array containing the byte values of the compressed data.  If you pass
a second argument, it must be a "stream" object (which must implement the
`writeByte` method).

The third argument may be omitted, or a number between 1 and 9 indicating
a compression level (1 being largest/fastest compression and 9 being
smallest/slowest compression).  Some algorithms also permit passing
an object for finer-grained control of various compression properties.

The second exported method is a function accepting one or two parameters:

`cmp.decompressFile = function(input, [output])`

The `input` parameter is as above.

If you omit the second argument, `decompressFile` will return a
`Uint8Array`, `Buffer` or JavaScript array with the decompressed
data, depending on what your platform supports.  For most modern
platforms (modern browsers, recent node.js releases) the returned
value will be a `Uint8Array`.

If you provide the second argument, it must be a "stream", implementing
the `writeByte` method.

### Models and coders

The second type of object implemented is a model/coder.  `Huffman` and
`RangeCoder` share the same interface as the simple context-0 probability
models `MTFModel`, `FenwickModel`, `LogDistanceModel`, and
`DeflateDistanceModel`.

`model.factory = function(parameters)`

This method returns a function which can be invoked with a `size` argument to
create a new instance of this model with the given parameters (which usually
include the input/output stream or coder).

`model.encode = function(symbol, [optional context])`

This method encodes the given symbol, possibly with the given additional
context, and then updates the model or adaptive coder if necessary.
The symbol is usually in the range `[0, size)`, although some
models allow adding "extra symbols" to the possible range, which are
usually given negative values.  For example, you might want to create a
`LogDistanceModel` with one extra state to encode "same distance as the
last one encoded".

`model.decode = function([optional context])`

Decode the next symbol and updates the model or adaptive coder.
The values returned are usually in the range `[0, size]` although
negative numbers may be returned if you requested "extra symbols" when
you created the model.

## Related articles and projects

* http://en.wikipedia.org/wiki/Dynamic_Markov_Compression Wikipedia article on DMC
* http://www.cs.uvic.ca/~nigelh/Publications/DMC.pdf Original DMC paper
* http://www.compressconsult.com/rangecoder/ Range Coder implementation in C

## Other JavaScript compressors

* https://github.com/cscott/lzjb LZJB
* https://github.com/cscott/lzma-purejs LZMA
* https://github.com/cscott/seek-bzip random-access bzip2 decompression

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
