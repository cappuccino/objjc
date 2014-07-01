/*
 * cli.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var acorn = require("objj-acorn"),
    chalk = require("chalk"),
    compiler = require("../lib/compiler.js"),
    fs = require("fs"),
    optionator = require("optionator"),
    path = require("path");

var inputFiles = [],
    options = {},
    silent = false,
    generateCode = true,
    outputPath = null,
    useStdin = false,
    optionEngine;

var optionDefinitions = [

    { heading: chalk.cyan("Parser options") },

    {
        option: "macro",
        alias: "m",
        type: "String | [String]",
        description: "Defines a macro. The argument should be in the form <name>[(arg[, argN])]=<definition>. A name with no args and no definition will be defined with the value 1. To be safe from shell expansion, the argument should be enclosed in single quotes. To define multiple macros, enclose multiple comma-delimited, single-quoted strings in square brackets, all enclosed by double-quotes. \n\n" + chalk.cyan("Examples") + ":\n--macro 'PLUS_ONE(arg)=arg + 1'\n--macro \"['FOO(arg)=arg + 1', 'BAR(s)=\"\\\"foo\\\"\" + s', 'DEBUG']\""
    },
    {
        option: "prefix",
        alias: "p",
        type: "String",
        description: "Macro definitions are read from the file as this path and applied to all compiled files."
    },
    {
        option: "strict-semicolons",
        type: "Boolean",
        default: "false",
        description: "Prevents the parser from doing automatic semicolon insertion (the default). Statements that do not end in semicolons will generate an error. Default: false"
    },


    { heading: chalk.cyan("Code generation options") },

    {
        option: "format",
        alias: "f",
        type: "String",
        default: "cappuccino",
        description: "Format the generated code according to the given named format. If the name contains no path separators, then the named standard format is used. The .json extension may be omitted in this case. Otherwise the format file at the given path is used. Default: cappuccino"
    },
    {
        option: "output",
        alias: "o",
        type: "String",
        description: "Writes generated code to the given directory (if not using stdin) or file (if using stdin) instead of the console. When not using stdin, the output filenames are based on the input filename (excluding the extension)."
    },
    {
        option: "source-map",
        type: "Boolean",
        description: "Generates a source map. This is mutually exclusive with --source-map-only. Default: true if --output is set."
    },
    {
        option: "source-map-only",
        type: "Boolean",
        default: "false",
        description: "Generates a source map but no source code. This is mutually exclusive with --source-map. Default: false"
    },
    {
        option: "include-comments",
        type: "Boolean",
        default: "false",
        description: "Comments in the source are included in the compiled code. May only be used in conjunction with --format. Default: false"
    },
    {
        option: "include-comment-line-breaks",
        type: "Boolean",
        default: "false",
        description: "Line breaks before comments are included in the compiled code. May only be used in conjunction with --include-comments. Default: false"
    },
    {
        option: "silent",
        alias: "s",
        type: "Boolean",
        default: "false",
        description: "If --output is not specified, this option suppresses console output of generated code and/or source map. Error messages will still be output. Default: false"
    },


    { heading: chalk.cyan("General options") },

    {
        option: "version",
        alias: "v",
        type: "Boolean",
        description: "Show the current version and exit."
    },
    {
        option: "help",
        alias: "h",
        type: "Boolean",
        description: "Show this help."
    },
    {
        option: "debug",
        alias: "d",
        type: "Boolean",
        default: "false",
        description: "If set, a stack trace is displayed if the compiler throws."
    }
];

function formatErrorMessage(message)
{
    message = message.replace(
        /--\w[\w-]+/g, function(match)
        {
            return chalk.yellow(match);
        }
    );

    return chalk.red("Error: ") + message;
}

function failWithMessage(message)
{
    throw new Error(formatErrorMessage(message));
}

function help(exitCode)
{
    var text = optionEngine.generateHelp({interpolate: {version: compiler.version}});

    // Colorize options in the help text
    text = text.replace(/\s--?\w[\w-]*/g, function(match)
    {
        return chalk.yellow(match);
    });

    console.log(text);
    process.exit(exitCode);
}

function parseOptions(args)
{
    optionEngine = optionator({
        prepend: chalk.cyan("objjc v{{version}}\nUsage") + ": objjc [options] file ...\n\nCompiles one or more files and outputs source code and/or a source map. If " + chalk.yellow("file") + " is '-', reads from stdin.",

        helpStyle: {
            maxPadFactor: 2  // Give a little more padding to the name column
        },

        options: optionDefinitions,

        mutuallyExclusive: [
            ["source-map", "source-map-only"]
        ]
    });

    var acornOptions = { objj: true, ecmaVersion: 5 };
    options = optionEngine.parse(args || process.argv);

    if (options.version)
    {
        console.log("objjc v" + compiler.version);
        process.exit(0);
    }
    else if (options.help)
        help(0);

    inputFiles = options._;

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

    if (options.output)
        outputPath = options.output;

    if (options.sourceMap === undefined && options.output)
        options.sourceMap = true;

    if (options.sourceMapOnly)
        generateCode = false;

    if (options.includeComments)
        acornOptions.trackComments = true;

    if (options.includeCommentLineBreaks)
        acornOptions.trackCommentsIncludeLineBreak = true;

    silent = !!options.silent;

    if (inputFiles.indexOf("-") >= 0)
    {
        useStdin = true;
        inputFiles = [];
    }

    if (inputFiles.length === 0 && !useStdin)
        failWithMessage("One or more input files must be specified.");

    if (acornOptions.trackCommentsIncludeLineBreak && !options.includeComments)
        failWithMessage("--include-comment-line-breaks may only be used in conjunction with --include-line-breaks.\n");

    if (options.sourceMap && useStdin)
        failWithMessage("--sourceMap may not be used with stdin.");

    options.acornOptions = acornOptions;

    return options;
}

/*eslint-enable complexity */

function makeOutputDir()
{
    outputPath = path.resolve(outputPath);

    var targetDir = useStdin ? path.dirname(outputPath) : outputPath;

    if (!fs.existsSync(targetDir))
        fs.mkdir(targetDir);
    else if (!fs.statSync(targetDir).isDirectory())
        throw new Error("'" + targetDir + "' is not a directory");
}

function readPrefix()
{
    var prefixPath = path.resolve(options.prefix);

    if (!fs.existsSync(prefixPath) || !fs.statSync(prefixPath).isFile())
        throw new Error("No such prefix file: '" + options.prefix + "'");

    var prefix = fs.readFileSync(prefixPath, "utf8"),
        prefixOptions = { objj: true };

    prefixOptions.sourceFile = path;

    if (options.sourceMap)
        prefixOptions.locations = true;

    // We never want (line:column) in the error messages
    prefixOptions.lineNoInErrorMessage = false;

    acorn.parse(prefix, prefixOptions);
    options.acornOptions.macros.push.apply(options.acornOptions.macros, acorn.getMacros());
}

function generate(sourceFile, compiled)
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
            sourceFile = outputPath;

        var baseFilename = path.basename(sourceFile, path.extname(sourceFile)),
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

function showWarnings(warnings)
{
    for (var i = 0; i < warnings.length; i++)
        console.warn(warnings[i].message);
}

function setupCompile()
{
    if (outputPath)
        makeOutputDir();

    if (options.prefix)
        readPrefix();
}

function compileFileOrSource(sourcePath, source)
{
    if (source === null)
    {
        if (!fs.existsSync(sourcePath))
            throw new Error("No such file: " + sourcePath);

        source = fs.readFileSync(sourcePath, "utf8");
    }
    else
        sourcePath = "<stdin>";

    var compiled = compiler.compile(source, sourcePath, options);

    generate(sourcePath, compiled);
    showWarnings(compiled.warnings, source);
}

function main(source)
{
    setupCompile();

    if (source === null)
    {
        var count = inputFiles.length || 1;

        for (var i = 0; i < count; i++)
        {
            var sourcePath = path.resolve(inputFiles[i]);
            compileFileOrSource(sourcePath, null);
        }
    }
    else
        compileFileOrSource(null, source);
}

exports.run = function(args)
{
    try
    {
        parseOptions(args);

        if (useStdin)
        {
            var source = "";

            process.stdin.resume();
            process.stdin.setEncoding("utf8");

            process.stdin.on(
                "data", function (chunk)
                {
                    source += chunk;
                }
            );

            process.stdin.on(
                "end", function ()
                {
                    main(source);
                }
            );
        }
        else
            main(null);
    }
    catch (ex)
    {
        console.log(formatErrorMessage(ex.message));

        if (options.debug)
            throw ex;

        process.exit(1);
    }
};
