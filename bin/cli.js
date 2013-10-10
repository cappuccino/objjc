#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var compiler = require("../lib/ObjJAcornCompiler.js");

var infile, compiled, options = {}, acornOptions = {}, silent = false, code = true, map = false, ast = false, output, outputFilename;

function help(status) {
  console.log("usage: " + path.basename(process.argv[1]) + " infile [--ecma3|--ecma5] [--strict-semicolons] [--track-comments]");
  console.log("        [--include-comments] [--include-comment-line-break] [(-o | --output) <path>");
  console.log("        [--formatter <path>]  [--indent-tab] [--indent-width <n>] [--indent-string <string>]");
  console.log("        [--track-spaces] [--track-locations] [--no-objj] [--no-preprocess] [--old-safari-bug]");
  console.log("        [--no-debug-symbols] [--no-type-signatures] [--generate-objj]");
  console.log("        [--source-map] [--ast] [--no-code]");
  console.log("        [-Dmacro[([p1, p2, ...])][=definition]] [--silent] [--help]");
  process.exit(status);
}

// We skip the high number unicode whitespaces and only allow regular extended ASCII codes
function isWhiteSpace(tok) {
    return ((tok < 14 && tok > 8) || tok === 32 || tok === 160);
}

for (var i = 2; i < process.argv.length; ++i) {
  var arg = process.argv[i];
  if (arg == "--ecma3") acornOptions.ecmaVersion = 3;
  else if (arg == "--ecma5") acornOptions.ecmaVersion = 5;
  else if (arg == "--strict-semicolons") acornOptions.strictSemicolons = true;
  else if (arg == "--track-comments") acornOptions.trackComments = true;
  else if (arg == "--include-comment-line-break") acornOptions.trackCommentsIncludeLineBreak = true;
  else if (arg == "--include-comments") options.includeComments = true, acornOptions.trackComments = true;
  else if (arg == "--track-spaces") acornOptions.trackSpaces = true;
  else if (arg == "--track-locations") acornOptions.locations = true;
  else if (arg == "--no-objj") acornOptions.objj = false;
  else if (arg == "--no-preprocess") acornOptions.preprocess = false;
  else if (arg == "--generate-objj") options.generateObjJ = true;
  else if (arg == "--silent") silent = true;
  else if (arg == "--old-safari-bug") options.transformNamedFunctionDeclarationToAssignment = true;
  else if (arg == "--no-code") code = false;
  else if (arg == "--ast") ast = true;
  else if (arg == "--source-map") map = true, options.sourceMap = true;
  else if (arg == "--no-debug-symbols") options.includeDebugSymbols = false;
  else if (arg == "--no-type-signatures") options.includeTypeSignatures = false;
  else if (arg == "--indent-width") options.indentationSpaces = parseInt(process.argv[++i]);
  else if (arg == "--indent-string") {
      if (options.indentationType) {
          console.log("Can't have both '--indent-string' and '--indent-tab'");
          help(1);
      } else
          options.indentationType = process.argv[++i];
  }
  else if (arg == "--indent-tab") {
      if (options.indentationType) {
          console.log("Can't have both '--indent-string' and '--indent-tab'");
          help(1);
      } else {
          options.indentationType = "\t";
          if (!options.indentationSpaces) options.indentationSpaces = 1;
      }
  }
  else if (arg == "--formatter") {
    var filePath = process.argv[++i],
        relative = filePath.substring(0, 1) !== '/',
        jsonFile = JSON.parse(fs.readFileSync(relative ? path.resolve(process.cwd(), filePath) : filePath,'utf8'));

        options.formatDescription = jsonFile;
  }
  else if (arg == "--output" || arg == "-o") output = process.argv[++i];
  else if (arg.slice(0, 2) == "-D") (acornOptions.macros || (acornOptions.macros = [])).push(arg.slice(2));
  else if (arg == "--help") help(0);
  else if (arg[0] == "-") help(1);
  else infile = arg;
}

if (!infile) help(1);

if (options.includeComments && !options.formatDescription) {
  console.log("Must have '--formatter' when using '--include-comments'");
  help(1);
}
if (options.generateObjJ && !options.formatDescription) {
  console.log("Must have '--formatter' when using '--generate-objj'");
  help(1);
}

if (output) {
    var relative = output.substring(0, 1) !== '/',
        absolutePath = relative ? path.resolve(process.cwd(), output) : output;

    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory())
        outputFilename = path.join(absolutePath, path.basename(infile, path.extname(infile)));
    else
        outputFilename = path.join(path.dirname(absolutePath), path.basename(absolutePath, path.extname(absolutePath)));
}

try {
  var source = fs.readFileSync(infile, "utf8");

  if (Object.keys(acornOptions).length !== 0)
      options.acornOptions = acornOptions;

  compiled = compiler.compile(source, infile, options);
} catch(e) {
  console.log(e.message);
  process.exit(1);
}

if (!silent && !output) {
  if (code)
    console.log(compiled.code());
  if (map)
    console.log(compiled.map());
  if (ast)
    console.log(compiled.ast());
}

if (output) {
  if (code)
    fs.writeFileSync(outputFilename + ".js", compiled.code());
  if (map)
    fs.writeFileSync(outputFilename + ".map", compiled.map());
  if (ast)
    fs.writeFileSync(outputFilename + ".ast", compiled.ast());
}
