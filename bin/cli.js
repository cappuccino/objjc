#!/usr/bin/env node
"use strict";

var path = require("path"),
    fs = require("fs"),
    compiler = require("../lib/compiler.js");

var infile,
    options = {},
    acornOptions = {objj: true},
    silent = false,
    generateCode = true,
    outputPath = null,
    formatPath = null,
    useStdin = !process.stdin.isTTY;

function help(status)
{
    var name = path.basename(process.argv[1]);

    console.log("usage: " + name + "[options] file\n");
    console.log("Compiles <file> and outputs source code and/or a source map.");
    console.log("If <file> is '-', reads from stdin. You may also pipe or redirect into " + name + " and omit <file>.");

    console.log("\nParser options:");
    console.log("--ecma3|--ecma5      Sets the ECMAScript version to parse. Default is version 5.");
    console.log("--strict-semicolons  Prevents the parser from doing automatic semicolon insertion.");
    console.log("                     Statements that do not end in semicolons will generate an error.");
    console.log("-Dmacro[([param, ...])][=definition]]");
    console.log("                     Defines a macro. A name with no parameters and no definition will be defined");
    console.log("                     with the value 1. To be safe from shell expansion, the values on either side");
    console.log("                     of the = should be enclosed in '', for example -D'PLUS_ONE(arg)'='arg + 1'.");
    console.log("                     May be used multiple times to define multiple macros.");
    console.log("--no-objj            Turns off Objective-J syntax parsing and disables Objective-J code generation.");
    console.log("--no-preprocess      Turns off the preprocessor.");

    console.log("\nCode generation options:");
    console.log("-o --output <path>   Write generated code to the given directory (which must exist) instead of the console.");
    console.log("                     The output filenames are based on the input filename (excluding the extension).");
    console.log("--tab-indent         Tabs are used to indent code.");
    console.log("--space-indent       Spaces (4 by default) are used to indent code. This is the default.");
    console.log("--indent-width N     Sets the number of spaces to use for indenting. May not be used with --tab-indent.");
    console.log("--source-map[-only]  Generates a source map for use with browsers that support them. If --source-map-only,");
    console.log("                     only the source map is generated.");
    console.log("--format <path>      Format the generated code according to the given format name or file. If <path>");
    console.log("                     contains no path separators, then the named standard format is used. The .json");
    console.log("                     extension may be omitted in this case. Otherwise the format file at the given");
    console.log("                     path is used.");
    console.log("--include-comments   Comments in the source are included in the compiled code. May only be used");
    console.log("                     in conjunction with --format.");
    console.log("--include-comment-line-breaks");
    console.log("                     Line breaks before comments are included in the compiled code. May only be used");
    console.log("                     in conjunction with --format.");
    console.log("--generate-objj      By default, Objective-J source is converted into plain JavaScript code. Passing");
    console.log("                     this option causes Objective-J code to be generated, which is useful if you want.");
    console.log("                     to beautify the original Objective-J source code. May only be used in conjunction");
    console.log("                     with --format.");
    console.log("--silent             Do not output anything, just return the exit status.");

    console.log("\nGeneral options:");
    console.log("--version            Print the current version and exit.");
    console.log("--help               Print this usage information and exit.");

    process.exit(status);
}

for (var i = 2; i < process.argv.length; ++i)
{
    var arg = process.argv[i];

    // Parser options
    if (arg === "--ecma3")
        acornOptions.ecmaVersion = 3;
    else if (arg === "--ecma5")
        acornOptions.ecmaVersion = 5;
    else if (arg === "--strict-semicolons")
        acornOptions.strictSemicolons = true;
    else if (arg.slice(0, 2) === "-D")
        (acornOptions.macros || (acornOptions.macros = [])).push(arg.slice(2));
    else if (arg === "--no-objj")
        acornOptions.objj = false;
    else if (arg === "--no-preprocess")
        acornOptions.preprocess = false;

    // Code generation options
    else if (arg === "--output" || arg === "-o")
        outputPath = process.argv[++i];
    else if (arg === "--tab-indent" || arg === "--space-indent")
    {
        if (options.indentString != null)
        {
            console.error("ERROR: --tab-indent and --space-indent are mutually exclusive.");
            process.exit(1);
        }
        else
        {
            if (arg === "--tab-indent")
            {
                options.indentString = "\t";
                options.indentWidth = 1;
            }
            else
                options.indentString = " ";
        }
    }
    else if (arg === "--indent-width")
    {
        if (options.indentString !== "\t")
            options.indentWidth = parseInt(process.argv[++i], 10);
        else
        {
            console.error("ERROR: --indent-width may not be used with --tab-indent.");
            process.exit(1);
        }
    }
    else if (arg.indexOf("--source-map") === 0)
    {
        options.sourceMap = true;

        if (arg === "--source-map-only")
            generateCode = false;
    }
    else if (arg === "--format")
        formatPath = process.argv[++i];
    else if (arg === "--include-comments")
    {
        options.includeComments = true;
        acornOptions.trackComments = true;
    }
    else if (arg === "--include-comment-line-breaks")
        acornOptions.trackCommentsIncludeLineBreak = true;
    else if (arg === "--generate-objj")
        options.generateObjJ = true;
    else if (arg === "--silent")
        silent = true;

    // General options
    else if (arg === "--version")
    {
        console.log(compiler.version);
        process.exit(0);
    }
    else if (arg.indexOf("--") === 0)
        help(0);
    else
    {
        if (arg === "-")
            useStdin = true;
        else
            infile = arg;
        break;
    }
}

if (!infile && !useStdin)
    help(1);

if (options.includeComments && !options.format)
{
    console.error("ERROR: --include-comments may only be used in conjunction with --format.");
    process.exit(1);
}

if (options.generateObjJ && !formatPath)
{
    console.error("ERROR: --generate-objj may only be used in conjunction with --format.");
    process.exit(1);
}

if (options.generateObjJ && !acornOptions.objj)
{
    console.error("ERROR: --no-objj and --generate-objj are mutually exclusive.");
    process.exit(1);
}

if (acornOptions.trackCommentsIncludeLineBreak && (!options.format || !options.includeComments))
{
    console.error("ERROR: --include-comment-line-breaks may only be used in conjunction with --include-line-breaks and --format.\n");
    process.exit(1);
}

if (options.sourceMap && useStdin)
{
    console.error("ERROR: --sourceMap may not be used with stdin.");
    process.exit(1);
}

if (formatPath)
{
    var filePath = formatPath,
        error = null;

    formatPath = null;

    if (filePath.indexOf("/") >= 0)
    {
        filePath = path.resolve(filePath);

        if (!fs.existsSync(filePath))
            error = "No file at the path: " + filePath;
        else
            formatPath = filePath;
    }
    else
    {
        if (path.extname(filePath) === "")
            filePath += ".json";

        formatPath = path.resolve(path.join("formats", filePath));

        if (!fs.existsSync(formatPath))
            error = "No such format: " + filePath;
    }

    if (!error)
    {
        try
        {
            if (!fs.statSync(formatPath).isFile())
                error = "Not a file: " + formatPath;
            else
            {
                var json = fs.readFileSync(formatPath);
                options.format = JSON.parse(json);
            }
        }
        catch (e)
        {
            error = "Invalid JSON in format file: " + formatPath;
        }
    }

    if (error)
    {
        console.error(error);
        process.exit(1);
    }
}

if (outputPath)
{
    outputPath = path.resolve(outputPath);

    if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isDirectory())
    {
        console.error("ERROR: No such directory: " + outputPath);
        process.exit(1);
    }
}

var source;

function main()
{
    var compiled;

    try
    {
        options.acornOptions = acornOptions;
        compiled = compiler.compile(source, infile, options);
    }
    catch (e)
    {
        console.error(e.message);
        process.exit(1);
    }

    if (!silent && !outputPath)
    {
        if (generateCode)
            console.log(compiled.code());
        if (options.sourceMap)
            console.log(compiled.map());
    }
    else if (outputPath)
    {
        var baseFilename = path.basename(infile, path.extname(infile)),
            filePath = path.join(outputPath, baseFilename);

        if (generateCode)
            fs.writeFileSync(filePath + ".js", compiled.code());
        if (options.sourceMap)
            fs.writeFileSync(filePath + ".map", compiled.map());
    }
}

if (useStdin)
{
    source = "";
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", function(chunk) {
        source += chunk;
    });

    process.stdin.on("end", function() {
        main();
    });
}
else
{
    source = fs.readFileSync(infile, "utf8");
    main();
}
