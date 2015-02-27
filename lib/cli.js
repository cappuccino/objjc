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

var chalk = require("chalk"),
    Runner = require("./runner"),
    utils = require("./utils"),
    compiler = require("./compiler");

var optionator,
    optionDefinitions = [

        { heading: chalk.cyan("Parser options") },

        {
            option: "macro",
            alias: "m",
            type: "String | [String]",
            description: "Defines a macro. The argument should be in the form <name>[(arg[, argN])]=<definition>. A name with no args and no definition will be defined with the value 1. To be safe from shell expansion, the argument should be enclosed in single quotes. To define multiple macros, enclose multiple comma-delimited, single-quoted strings in square brackets, all enclosed by double-quotes. \n\n" + chalk.cyan("Examples") + ":\n--macro 'PLUS_ONE(arg)=arg + 1'\n--macro \"['FOO(arg)=arg + 1', 'BAR(s)=\"\\\"foo\\\"\" + s', 'DEBUG']\""
        },
        {
            option: "macro-prefix",
            alias: "p",
            type: "String",
            description: "Macro definitions are read from the file at this path and applied to all compiled files."
        },
        {
            option: "strict-semicolons",
            type: "Boolean",
            default: "false",
            description: "Prevents the parser from doing automatic semicolon insertion (the default). Statements that do not end in semicolons will generate an error."
        },


        { heading: chalk.cyan("Compilation options") },

        {
            option: "environment",
            alias: "env",
            type: "String",
            default: "browser",
            description: "The environment in which the code will run. This determines the set of predefined globals. Possible values: browser, node"
        },
        {
            option: "warnings",
            alias: "W",
            type: "[String]",
            description: "A comma-separated list of warnings to specify, enable or disable. To enable a specific warning, prefix it with \"+\". To disable a specific warning, prefix it with \"no-\". To specify the list of enabled warnings, use names without prefixes. A list of warnings may not be mixed with \"+\" or \"no-\" prefixed warnings. Use --list-warnings to see the list of possible warning names."
        },
        {
            option: "colorize",
            type: "Boolean",
            default: "true",
            description: "If specified, warning/error output is colorized. Use --no-colorize to suppress colorizing."
        },
        {
            option: "max-errors",
            type: "Number",
            default: "20",
            description: "The maximum number of errors that can occur before compilation is aborted."
        },


        { heading: chalk.cyan("Code generation options") },

        {
            option: "format",
            alias: "f",
            type: "String",
            default: "cappuccino",
            description: "Format the generated code according to the given named format. If the name contains no path separators, then the named standard format is used. The .json extension may be omitted in this case. Otherwise the format file at the given path is used."
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
            description: "Generates a source map but no source code. This is mutually exclusive with --source-map."
        },
        {
            option: "source-root",
            type: "String",
            default: "",
            description: "Specifies the root URL to the parent directory of the source files. This can either be an absolute URL (e.g. \"http://mysite.com/js/src\") or a path relative to the generated files (e.g. \"../src\")."
        },
        {
            option: "include-comments",
            type: "Boolean",
            default: "false",
            description: "Comments in the source are included in the compiled code. May only be used in conjunction with --format."
        },
        {
            option: "include-comment-line-breaks",
            type: "Boolean",
            default: "false",
            description: "Line breaks before comments are included in the compiled code. May only be used in conjunction with --include-comments."
        },
        {
            option: "quiet",
            alias: "q",
            type: "Boolean",
            default: "false",
            description: "This option suppresses console output of generated code and/or source map. Warnings and error messages will still be output, and if --output is specified, generated code and/or source map will be saved there."
        },
        {
            option: "silent",
            alias: "s",
            type: "Boolean",
            default: "false",
            description: "This option suppresses all console output, including warnings and errors. If --output is specified, generated code and/or source map will be saved there."
        },


        { heading: chalk.cyan("General options") },

        {
            option: "version",
            alias: "v",
            type: "Boolean",
            description: "Show the current version and exit."
        },
        {
            option: "list-warnings",
            type: "Boolean",
            description: "Displays a list of possible warnings and exits."
        },
        {
            option: "help",
            alias: "h",
            type: "Boolean",
            description: "Show this help."
        },
        {
            option: "debug",
            type: "Boolean",
            default: "false",
            description: "If set, the global DEBUG variable is set to true. This allows you to wrap debugging statements in `if (DEBUG)`, which will be removed by uglify."
        },
        {
            option: "stack-trace",
            type: "Boolean",
            default: "false",
            description: "If set, a stack trace is displayed if the compiler throws."
        }
    ];

function formatErrorMessage(message)
{
    return "objjc: " + chalk.red("error: ") + chalk.gray(message);
}

function colorizeOptions(text)
{
    return text.replace(
        /(^|\s)--?\w[\w-]*/g, function(match)
        {
            return chalk.yellow(match);
        }
    );
}

function failWithMessage(message)
{
    throw new Error(colorizeOptions(message));
}

function compilerVersion()
{
    return require("./compiler").version;
}

function help(exitCode)
{
    var text = optionator.generateHelp({ interpolate: { version: compilerVersion() } });

    console.log(colorizeOptions(text));
    process.exit(exitCode);
}

function parseOptions(args)
{
    optionator = require("optionator")({
        prepend: chalk.cyan("objjc v{{version}}\nUsage") + ": objjc [options] file ...\n\nCompiles one or more files and outputs source code and/or a source map. If " + chalk.yellow("file") + " is '-', reads from stdin.",

        append: chalk.cyan("Exit status") + ":\n" + chalk.grey("objjc") + " exits with one of the following values:\n\n   0  All files compiled with no errors or warnings\n   1  Some files compiled with warnings\n   2  Some files compiled with errors",

        helpStyle: {
            maxPadFactor: 2  // Give a little more padding to the name column
        },

        options: optionDefinitions,

        mutuallyExclusive: [
            ["source-map", "source-map-only"],
            ["quiet", "silent"]
        ]
    });

    var acornOptions = { objj: true, ecmaVersion: 5 },
        options = optionator.parse(args || process.argv);

    if (options.version)
    {
        console.log("objjc v" + compilerVersion());
        process.exit(0);
    }
    else if (options.help)
        help(0);
    else if (options.listWarnings)
    {
        console.log(Object.keys(compiler.defaultOptions.warnings).sort().join("\n"));
        process.exit(0);
    }

    options.files = options._;

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

    if (options.includeComments)
        acornOptions.trackComments = true;

    if (options.includeCommentLineBreaks)
        acornOptions.trackCommentsIncludeLineBreak = true;

    if (options.files.indexOf("-") >= 0)
    {
        options.useStdin = true;
        options.files = [];
    }
    else
        options.useStdin = false;

    if (options.files.length === 0 && !options.useStdin)
        failWithMessage("no input files");

    if (options.sourceMap === undefined && !options.useStdin && options.output)
        options.sourceMap = true;

    if (acornOptions.trackCommentsIncludeLineBreak && !options.includeComments)
        failWithMessage("--include-comment-line-breaks may only be used in conjunction with --include-line-breaks\n");

    if (options.sourceMap && options.useStdin)
        failWithMessage("--sourceMap may not be used with stdin");

    if (["browser", "node"].indexOf(options.environment) < 0)
        failWithMessage("--environment must be one of: browser, node");

    if (options.maxErrors < 1)
        failWithMessage("--max-errors must be >= 1");

    options.acornOptions = acornOptions;

    return options;
}

exports.run = function(args, exitProcess)
{
    var options = {},
        exitCode = 0;

    try
    {
        options = parseOptions(args);

        var runner = new Runner(options);

        if (options.useStdin)
        {
            var source = utils.readStdin();

            exitCode = runner.compileSource("<stdin>", source);
        }
        else
            exitCode = runner.compileFiles(options.files);
    }
    catch (ex)
    {
        if (!options.silent)
            console.log(formatErrorMessage(ex.message));

        if (options.stackTrace)
            throw ex;

        exitCode = 2;
    }

    if (exitProcess)
        process.exit(exitCode);

    return exitCode;
};
