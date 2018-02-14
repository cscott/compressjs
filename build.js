({
  baseUrl: "./lib",
  optimize: "uglify",
  out: "bin/bzip2.build.js",
  name: 'Bzip2',
  wrap: false,
  preserveLicenseComments: false,
  keepAmdefine: false,
  findNestedDependencies: true,
  onModuleBundleComplete: function (data) {
    // Clean any AMD usage.
    var fs = module.require('fs'),
      amdclean = module.require('amdclean'),
      outputFile = data.path,
      cleanedCode = amdclean.clean({
        'filePath': outputFile
      });
    // Remove the compatibility usage.
    cleanedCode = cleanedCode.replace(/if \(true\) {\n  var define = amdefine\(module\);\n}/g, '');
    // Remove the wrap around.
    cleanedCode = cleanedCode.replace(';(function() {', '');
    // Replace with a module.exports.
    cleanedCode = cleanedCode.replace('}());', 'module.exports = Bzip2;');

    fs.writeFileSync(outputFile, cleanedCode);
  }
});
