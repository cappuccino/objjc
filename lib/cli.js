#!/usr/bin/env node
"use strict";

var path = require("path"),
    fs = require("fs"),
    optionator = require("optionator"),
    compiler = require("../lib/compiler.js");

var inFiles = [],
    options = {},
    acornOptions = {objj: true},
    silent = false,
    generateCode = true,
    outputPath = null,
    formatPath = null,
    useStdin = false;

function parseOptions()
{
    optionator = optionator({
        prepend: "usage: objjc [options] file ...\nCompiles one or more files and outputs source code and/or a source map. If <file> is '-', reads from stdin.",
        helpStyle: {
            maxPadFactor: 2.0
        },
        options: [
            { heading: "Parser options" },
            {
                option: "macro",
                type: "String | [String]",
                description: "Defines a macro. The argument should be in the form <name>[(arg[, argN])]=<definition>. A name with no args and no definition will be defined with the value 1. To be safe from shell expansion, the argument should be enclosed in single quotes. To define multiple macros, enclose multiple comma-delimited, single-quoted strings in square brackets, all enclosed by double-quotes. \n\nExamples:\n--macro 'PLUS_ONE(arg)=arg + 1'\n--macro \"['FOO(arg)=arg + 1', 'BAR(s)=\"\\\"foo\\\"\" + s', 'DEBUG']\""
            },
            {
                option: "prefix",
                type: "String",
                description: "Macro definitions are read from the file as this path and applied to all compiled files."
            },
            {
                option: "ecma3",
                type: "Boolean",
                description: "Tells the parser to parse ECMAScript 3."
            },
            {
                option: "ecma5",
                type: "Boolean",
                description: "Tells the parser to parse ECMAScript 5."
            },
            {
                option: "strict-semicolons",
                type: "Boolean",
                description: "Prevents the parser from doing automatic semicolon insertion (the default). Statements that do not end in semicolons will generate an error."
            },
            {
                option: "no-objj",
                type: "Boolean",
                description: "Turns off Objective-J syntax parsing and disables Objective-J code generation."
            },
            {
                option: "no-preprocess",
                type: "Boolean",
                description: "Turns off the preprocessor."
            },

            { heading: "Code generation options" },
            {
                option: "output",
                type: "String",
                description: "Writes generated code to the given directory (if not using stdin) or file (if using stdin) instead of the console. When not using stdin, the output filenames are based on the input filename (excluding the extension)."
            },
            {
                option: "tab-indent",
                type: "String",
                description: "Tabs are used to indent code."
            },
            {
                option: "space-indent",
                type: "String",
                description: "Spaces (4 by default) are used to indent code. This is the default."
            },
            {
                option: "indent-width",
                type: "Int",
                description: "Sets the number of spaces to use for indenting. May not be used with --tab-indent."
            },
            {
                option: "source-map",
                type: "Boolean",
                description: "Generates a source map for use with browsers that support them."
            },
            {
                option: "source-map-only",
                type: "Boolean",
                description: "Only generates a source map for use with browsers that support them."
            },
            {
                option: "format",
                type: "String",
                description: "Format the generated code according to the given named format. If the name contains no path separators, then the named standard format is used. The .json extension may be omitted in this case. Otherwise the format file at the given path is used."
            },
            {
                option: "include-comments",
                type: "Boolean",
                description: "Comments in the source are included in the compiled code. May only be used in conjunction with --format."
            },
            {
                option: "include-comment-line-breaks",
                type: "Boolean",
                description: "Line breaks before comments are included in the compiled code. May only be used in conjunction with --format."
            },
            {
                option: "generate-objj",
                type: "Boolean",
                description: "By default, Objective-J source is converted into plain JavaScript code. Passing this option causes Objective-J code to be generated, which is useful if you want to beautify the original Objective-J source code. May only be used in conjunction with --format."
            },
            {
                option: "silent",
                type: "Boolean",
                description: "Suppress normal output. Error messages will still be output."
            },

            { heading: "General options" },
            {
                option: "version",
                type: "Boolean",
                description: "Show the current version and exit."
            },
            {
                option: "help",
                type: "Boolean",
                description: "Show this help."
            }
        ],
        mutuallyExclusive: [
            ["ecma3", "ecma5"],
            ["tab-indent", "space-indent"],
            ["tab-indent", "indent-width"],
            ["source-map", "source-map-only"]
        ]
    });

    try
    {
        options = optionator.parse(process.argv);

        if (options.version)
        {
            console.log("objjc v" + compiler.version);
            process.exit(0);
        }
        else if (options.help)
        {
            console.log(optionator.generateHelp());
            process.exit(0);
        }
    }
    catch (ex)
    {
        console.error("ERROR: " + ex.message);
        process.exit(1);
    }

    inFiles = options._;

    if (options.ecma3)
        acornOptions.ecmaVersion = 3;
    else if (options.ecma5)
        acornOptions.ecmaVersion = 5;

    if (options.strictSemicolons)
        acornOptions.strictSemicolons = true;

    if (options.macro)
    {
        if (Array.isArray(options.macro))
            acornOptions.macros = options.macro;
        else
            acornOptions.macros = [options.macro];
    }
    else
        acornOptions.macros = [];

    if (options.noObjj)
        acornOptions.objj = false;

    if (options.noPreprocess)
        acornOptions.preprocess = false;

    if (options.output)
        outputPath = options.output;

    if (options.tabIndent)
    {
        options.indentString = "\t";
        options.indentWidth = 1;
    }
    else
        options.indentString = " ";

    if (options.sourceMapOnly)
        generateCode = false;

    if (options.format)
        formatPath = options.format;

    if (options.includeComments)
        acornOptions.trackComments = true;

    if (options.includeCommentLineBreaks)
        acornOptions.trackCommentsIncludeLineBreak = true;

    options.generateObjJ = !!options.generateObjj;
    silent = !!options.silent;

    if (inFiles.indexOf("-") >= 0)
    {
        useStdin = true;
        inFiles = [];
    }

    if (inFiles.length === 0 && !useStdin)
    {
        console.log(optionator.generateHelp());
        process.exit(0);
    }

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

    options.acornOptions = acornOptions;
}

function loadFormat()
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

function makeOutputDir()
{
    outputPath = path.resolve(outputPath);

    var targetDir = useStdin ? path.dirname(outputPath) : outputPath;

    if (!fs.existsSync(targetDir))
        fs.mkdir(targetDir);
    else if (!fs.statSync(targetDir).isDirectory())
        throw new Error("'" + targetDir + "' is not a directory");
}

function generate(inFile, compiled)
{
    if (!silent && !outputPath)
    {
        if (generateCode)
            console.log(compiled.code());

        if (options.sourceMap)
            console.log(compiled.map());
    }
    else if (outputPath)
    {
        if (useStdin)
            inFile = outputPath;

        var baseFilename = path.basename(inFile, path.extname(inFile)),
            targetPath;

        if (useStdin)
            targetPath = path.join(path.dirname(outputPath), baseFilename);
        else
            targetPath = path.join(outputPath, baseFilename);

        var filePath = targetPath + ".js";

        if (generateCode)
            fs.writeFileSync(filePath, compiled.code());

        if (options.sourceMap)
            fs.writeFileSync(targetPath + ".map", compiled.map());
    }
}

function main(source)
{
    try
    {
        if (formatPath)
            loadFormat();

        if (outputPath)
            makeOutputDir();

        if (options.prefix)
            compiler.readPrefix(options);

        var compiled,
            count = inFiles.length || 1;

        for (var i = 0; i < count; ++i)
        {
            var inFile;

            if (source === null)
            {
                inFile = path.resolve(inFiles[i]);
                source = fs.readFileSync(inFile, "utf8");
            }
            else
                inFile = "<stdin>";

            compiled = compiler.compile(source, inFile, options);
            source = null;

            generate(inFile, compiled);
        }
    }
    catch (ex)
    {
        console.error("ERROR: " + ex.message);
        //process.exit(1);
        throw ex;
    }
}

parseOptions();

if (useStdin)
{
    var source = "";

    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", function(chunk) {
        source += chunk;
    });

    process.stdin.on("end", function() {
        main(source);
    });
}
else
{
    main(null);
}
