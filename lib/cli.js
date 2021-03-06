"use strict";

const
    acornObjj = require("acorn-objj"),
    chalk = require("chalk"),
    exceptions = require("./exceptions.js"),
    formats = require("./formats.js"),
    issueHandler = require("acorn-issue-handler"),
    Runner = require("./runner.js"),
    compiler = require("./compiler.js");

let optionator;

const validAcornOptions = new Set([
    "allow-hash-bang",
    "module",
    "strict-semicolons"
]);

// Remove acorn options that don't make sense here.
// We don't support ecma yet because we only handle ES5.
function filterAcornOptions(option)
{
    return validAcornOptions.has(option.option);
}

/* eslint-disable max-len */

const
    optionDefinitions = [

        ...acornObjj.acornOptionDefinitions.filter(filterAcornOptions),

        { heading: chalk.cyan.bold("Compiler options") },

        {
            option: "environment",
            alias: "env",
            type: "String",
            default: "browser",
            description: "The environment in which the code will run. " +
                "This determines the set of predefined globals. Possible values: browser, node"
        },
        {
            option: "ignore-warnings",
            type: "Boolean",
            default: "false",
            description: "If true, errors are generated but warnings are ignored."
        },
        {
            option: "max-errors",
            type: "Number",
            default: "20",
            description: "The maximum number of errors that can occur before compilation is aborted. " +
                "A number less than 1 means no limit."
        },
        {
            option: "warnings",
            alias: "W",
            type: "[String]",
            description: "A comma-separated list of optional warnings to specify, enable or disable. " +
                "To enable/disable all optional warnings, use \"all\"/\"none\". " +
                "To enable a specific optional warning, prefix it with \"+\". " +
                "To disable a specific optional warning, prefix it with \"no-\". " +
                "To specify the list of enabled optional warnings, use names without prefixes. " +
                "A list of optional warnings may not be mixed with \"+\" or \"no-\" prefixed warnings. " +
                "Use --list-optional-warnings to see the list of optional warning names. " +
                "Note that there are many non-optional compiler warnings that will not be affected by this option."
        },

        { heading: chalk.cyan.bold("Code generation options") },

        {
            option: "ast",
            type: "Number",
            description: "Prints out the AST of the source to the console formatted with the given indent. " +
                "An indent of zero prints out the AST with no formatting and no white space. " +
                "This option overrides output and source map options."
        },
        {
            option: "format",
            alias: "f",
            type: "String",
            default: "cappuccino",
            description: "Format the generated code according to the given named format. " +
                "If the name contains no path separators, then the named standard format is used. " +
                "The .json extension may be omitted in this case. " +
                "Otherwise the format file at the given path is used. " +
                "Use --list-formats to see the available formats."
        },
        {
            option: "inline-msg-send",
            type: "Boolean",
            default: "false",
            description: "If true, faster Objective-J message send code is generated."
        },
        {
            option: "method-names",
            alias: "m",
            type: "Boolean",
            default: "true",
            description: "If true, generated Objective-J method functions are named for easier debugging. " +
                "If false or if --no-method-names is used, Objective-J method functions are anonymous."
        },
        {
            option: "objj-scope",
            type: "Undefined | Boolean",
            default: "undefined",
            description: "If true, code is generated according to Objective-J scoping rules. " +
                "By default, *.j files are treated as Objective-J source."
        },
        {
            option: "output",
            alias: "o",
            type: "Path",
            description: "Writes generated code to the given directory (if not using stdin)" +
                " or file (if using stdin) instead of the console. " +
                "When not using stdin, the output filenames are based on the input filename " +
                "(excluding the extension)."
        },
        {
            option: "quiet",
            alias: "q",
            type: "Boolean",
            default: "false",
            description: "This option suppresses console output of generated code and/or source map. " +
            "Warnings and error messages will still be output, and if --output is specified, " +
            "generated code and/or source map will be saved there."
        },
        {
            option: "silent",
            alias: "s",
            type: "Boolean",
            default: "false",
            description: "This option suppresses all console output, including warnings and errors. " +
            "If --output is specified, generated code and/or source map will be saved there."
        },
        {
            option: "source-map",
            type: "Boolean",
            default: "false",
            description: "Generates a source map. This is mutually exclusive with --source-map-only."
        },
        {
            option: "source-map-only",
            type: "Boolean",
            description: "Generates a source map but no source code. This is mutually exclusive with --source-map."
        },
        {
            option: "source-root",
            type: "URL",
            default: "",
            description: "Specifies the root URL to the parent directory of the source files. " +
                "This can either be an absolute URL (e.g. \"http://mysite.com/js/src\") " +
                "or a path relative to the generated files (e.g. \"../src\")."
        },
        {
            option: "type-signatures",
            alias: "t",
            type: "Boolean",
            default: "true",
            description: "If true, type information is generated (and checked by the runtime) " +
            "for method return types, method parameters, and ivars. If false or if " +
            "--no-type-signatures is used, no runtime type checking is performed."
        },

        { heading: chalk.cyan.bold("General options") },

        {
            option: "debug",
            type: "Boolean",
            default: "false",
            description: "If set, the global DEBUG variable is set to true. " +
                "This allows you to wrap debugging statements in `if (DEBUG)`, " +
                "which will be removed in a deployment build. Also, `@import <Something.j>` " +
                "will import the debug version of 'Something.j'."
        },
        {
            option: "help",
            alias: "h",
            type: "Boolean",
            description: "Show this help."
        },
        {
            option: "list-formats",
            type: "Boolean",
            description: "Displays a list of available formats."
        },
        {
            option: "list-optional-warnings",
            type: "Boolean",
            description: "Displays a list of optional warnings and exits. " +
                "Warnings that are enabled by default are prefixed with '+', " +
                "those disabled by default are prefixed with '-'."
        },
        {
            option: "color",
            alias: "colors",
            type: "Boolean",
            default: "true",
            description: "By default, warning/error console output is colorized. " +
                "Use --no-color to suppress colorizing."
        },
        {
            option: "stack-trace",
            type: "Boolean",
            default: "false",
            description: "If true, a stack trace is displayed if an unexpected error occurs."
        },
        {
            option: "version",
            alias: "v",
            type: "Boolean",
            description: "Show the current version and exit."
        }
    ],

    optionatorConfig = {
        prepend: chalk.cyan("{{executable}} v{{version}}") +
        " (acorn-objj v{{acornObjjVersion}}, acorn v{{acornVersion}})\nUsage" +
        ": {{executable}} [options] file ...\n\nCompiles one or more files and outputs source code " +
        `and/or a source map. If ${chalk.yellow("file")} is '-', reads from stdin.`,

        append: `${chalk.cyan("Exit status")}:\n${chalk.grey("{{executable}}")}` +
        " exits with one of the following values:\n\n" +
        "   0  All files compiled with no errors or warnings\n" +
        "   1  Some files compiled with warnings\n" +
        "   2  Some files compiled with errors",

        helpStyle: {
            maxPadFactor: 2 // Give a little more padding to the name column
        },

        typeAliases: {
            Path: "String",
            URL: "String"
        },

        options: optionDefinitions,

        mutuallyExclusive: [
            ["source-map", "source-map-only"],
            ["quiet", "silent"]
        ]
    };

/* eslint-enable max-len */

function getFullVersion()
{
    const env = Runner.getEnvironment();

    return `${env.executable} v${env.version} (acorn-objj v${env.acornObjjVersion}, acorn v${env.acornVersion})`;
}

// istanbul ignore next
function generateHelp()
{
    const help = optionator.generateHelp({ interpolate: Runner.getEnvironment() });

    return acornObjj.utils.colorizeOptions(help);
}

function parseOptions(args, parseOpts)
{
    optionator = require("optionator")(optionatorConfig);

    const options = optionator.parse(args, parseOpts);

    if (options.version || options.help)
        return options;

    options.files = options._;

    if (options.files.indexOf("-") >= 0)
    {
        options.useStdin = true;
        options.files = [];
    }
    else
        options.useStdin = false;

    if (["browser", "node"].indexOf(options.environment) === -1)
        optionsFailure(options, "environment must be 'browser' or 'node'");

    if (options.ast === undefined)
    {
        if (options.sourceMapOnly)
            options.sourceMap = true;

        if (options.sourceMap && options.useStdin)
            optionsFailure(options, "--source-map and --source-map-only may not be used with stdin");
    }

    return options;
}

// node v6 broke stdio on process.exit
// See https://github.com/nodejs/node/issues/6456
function nodeV6TempFix()
{
    // istanbul ignore next
    [process.stdout, process.stderr].forEach(s =>
    {
        if (s && s.isTTY && s._handle && s._handle.setBlocking)
            s._handle.setBlocking(true);
    });
}

exports.run = (args, runOptions) =>
{
    nodeV6TempFix();
    runOptions = runOptions || /* istanbul ignore next */ {};

    let options = {},
        exitCode,
        runner;

    try
    {
        options = parseOptions(args, runOptions.parseOptions);

        if (options.version)
            console.log(getFullVersion());

        // istanbul ignore next: no point in testing this
        else if (options.help)
            console.log(generateHelp());

        else if (options.listOptionalWarnings)
        {
            const
                warnings = compiler.defaultOptions.warnings,
                list = [];

            // Output a sorted list of the optional warnings,
            // prefixing with '+' if it's on by default, otherwise '-'.
            for (const key of Object.keys(warnings).sort())
                list.push((warnings[key] ? "+" : "-") + key);

            console.log(list.join("\n"));
        }

        else if (options.listFormats)
            console.log(formats.availableFormats().join("\n"));

        else if (options.files.length === 0 && !options.useStdin)
            optionsFailure(options, "no input files");

        else
        {
            runner = new Runner(options);

            // istanbul ignore if
            if (options.useStdin)
            {
                const source =
                    runOptions.stdin ||
                    /* istanbul ignore next */ acornObjj.utils.readStreamSync(process.stdin);

                exitCode = runner.compileSource("<stdin>", source);
            }
            else
                exitCode = runner.compileFiles(options.files);
        }
    }
    catch (ex)
    {
        // istanbul ignore next: this only occurs if there are errors in my code
        if (!options.silent)
        {
            if (!issueHandler.isIssue(ex) && !(ex instanceof exceptions.CompileAbortedError))
            {
                console.log(`${Runner.getEnvironment().executable}: ${chalk.red("error:")} ${ex.message}`);

                if (options.stackTrace)
                    console.log("\n" + ex.stack);
            }
        }

        exitCode = Runner.EXIT_STATUS_ERRORS;
    }

    return exitCode;
};

function optionsFailure(options, message)
{
    // Don't show the stack for option failures
    options.stackTrace = false;
    acornObjj.utils.failWithMessage(message);
}
