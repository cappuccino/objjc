"use strict";

var acorn = require("objj-acorn"),
    chalk = require("chalk"),
    codeGenerator = require("./code_generator"),
    compiler = require("./compiler"),
    exceptions = require("./exceptions"),
    fs = require("fs"),
    merge = require("lodash.merge"),
    mkdirp = require("mkdirp").sync,
    path = require("path"),
    reporters = require("./reporter"),
    startsWith = require("lodash.startswith");

exports.EXIT_STATUS_SUCCESS = 0;
exports.EXIT_STATUS_WARNINGS = 1;
exports.EXIT_STATUS_ERRORS = 2;

function setupWarnings(/* Array */ warnings)
{
    var result = Object.create(null),
        warningMode = "none";

    merge(result, compiler.defaultOptions.warnings);

    warnings.every(
        function(warning)
        {
            var value = true;

            if (warning === "all" || warning === "none")
            {
                value = warning === "all";

                Object.keys(result).forEach(
                    function(key)
                    {
                        result[key] = value;
                    }
                );

                return false; // Abort every()
            }

            if (startsWith(warning, "no-"))
            {
                if (warningMode === "set")
                {
                    warningMode = "mixed";
                }
                else
                {
                    warning = warning.substring("no-".length);
                    value = false;
                    warningMode = "exclusive";
                }
            }
            else if (startsWith(warning, "+"))
            {
                if (warningMode === "set")
                {
                    warningMode = "mixed";
                }
                else
                {
                    warning = warning.substring(1);
                    value = true;
                    warningMode = "inclusive";
                }
            }
            else if (warningMode === "none")
            {
                // On the first "set" warning, reset all to false
                Object.keys(result).forEach(
                    function(key)
                    {
                        result[key] = false;
                    }
                );

                warningMode = "set";
            }
            else if (warningMode !== "set")
            {
                warningMode = "mixed";
            }

            if (warningMode === "mixed")
            {
                console.warn("objjc: " + chalk.yellow("warning: ") +
                             chalk.gray("listing specific compiler warnings may not be mixed" +
                                        " with inclusive/exclusive warnings"));

                return false; // Abort every()
            }

            if (compiler.defaultOptions.warnings.hasOwnProperty(warning))
                result[warning] = value;
            else
                console.warn(
                    "objjc: " + chalk.yellow("warning: ") + chalk.gray("unknown compiler warning '%s'"), warning
                );

            return true;
        }
    );

    return result;
}

function setupOptions(options)
{
    var newOptions = merge(options, {});

    for (var option in compiler.defaultOptions)
    {
        if (options.hasOwnProperty(option))
        {
            if (option === "warnings" && Array.isArray(options.warnings))
                newOptions[option] = setupWarnings(options.warnings);
            else
                newOptions[option] = options[option];
        }
        else
        {
            var defaultOption = compiler.defaultOptions[option];

            newOptions[option] = typeof defaultOption === "function" ? defaultOption() : defaultOption;
        }
    }

    return newOptions;
}

var Runner = function(options)
{
    this.options = setupOptions(options || {});
    this.compiler = null;
    this.destPath = null;
    global.DEBUG = !!this.options.debug;
};

module.exports = Runner;

Runner.prototype.getCompiler = function()
{
    return this.compiler;
};

Runner.prototype.makeOutputDir = function()
{
    var outputPath = path.resolve(this.options.output),
        targetDir = this.options.useStdin ? path.dirname(outputPath) : outputPath;

    try
    {
        mkdirp(targetDir);
    }
    catch (e)
    {
        throw new Error("could not create output directory (" + e.message + ")");
    }
};

Runner.prototype.readMacroPrefix = function()
{
    var prefixPath = path.resolve(this.options.macroPrefix),
        prefixOptions = { objj: true },
        prefix;

    try
    {
        prefix = fs.readFileSync(prefixPath, { encoding: "utf8" });
    }
    catch (e)
    {
        var error;

        if (e.code === "ENOENT" || e.code === "EISDIR")
            error = "no such prefix file '" + prefixPath + "'";
        else
            error = "could not read prefix file (" + e.message + ")";

        throw new Error(error);
    }

    prefixOptions.sourceFile = path;

    if (this.options.sourceMap)
        prefixOptions.locations = true;

    // We never want (line:column) in the error messages
    prefixOptions.lineNoInErrorMessage = false;

    acorn.parse(prefix, prefixOptions);
    this.options.acornOptions.macros.push.apply(this.options.acornOptions.macros, acorn.getMacros());
};

Runner.prototype.setupCompile = function()
{
    if (this.options.output)
        this.makeOutputDir();

    if (this.options.macroPrefix)
        this.readMacroPrefix();
};

Runner.prototype.getDestPath = function(sourceFile)
{
    if (this.destPath)
        return this.destPath;

    var destPath;

    if (this.options.output)
    {
        var outputPath = path.resolve(this.options.output);

        if (this.options.useStdin)
            sourceFile = outputPath;

        var baseFilename = path.basename(sourceFile, path.extname(sourceFile));

        if (this.options.useStdin)
            destPath = path.join(path.dirname(outputPath), baseFilename);
        else
            destPath = path.join(outputPath, baseFilename);

        destPath += ".js";
    }
    else
        destPath = path.basename(sourceFile, path.extname(sourceFile)) + ".js";

    return destPath;
};

Runner.prototype.generate = function(sourceFile, destPath)
{
    var generateCode = !this.options.sourceMapOnly;

    if (this.options.output)
    {
        if (generateCode)
            fs.writeFileSync(destPath, this.compiler.getCode());

        if (this.options.sourceMap)
            fs.writeFileSync(destPath + ".map", compiler.getSourceMap());
    }
    else if (!this.options.quiet)
    {
        if (generateCode)
            console.log(this.compiler.getCode());

        if (this.options.sourceMap)
            console.log(this.compiler.getSourceMap());
    }
};

Runner.prototype.compileFile = function(file)
{
    return this.compileFiles([file]);
};

Runner.prototype.compileFiles = function(files)
{
    var exitCode = exports.EXIT_STATUS_SUCCESS;

    this.setupCompile();

    for (var i = 0; i < files.length; i++)
    {
        var sourcePath = path.resolve(files[i]);

        exitCode = Math.max(this.compileFileOrSource(sourcePath), exitCode);
    }

    return exitCode;
};

Runner.prototype.compileSource = function(sourcePath, source)
{
    this.setupCompile();

    return this.compileFileOrSource(sourcePath, source);
};

Runner.prototype.compileFileOrSource = function(sourcePath, source)
{
    var error;

    this.sourcePath = sourcePath;

    if (!source)
    {
        try
        {
            source = fs.readFileSync(sourcePath, { encoding: "utf8" });
        }
        catch (e)
        {
            if (e.code === "ENOENT" || e.code === "EISDIR")
                error = "no such file '" + sourcePath + "'";
            else
                error = "could not read file (" + e.message + ")";

            throw new Error(error);
        }
    }

    this.source = source;

    var acornOptions = this.options.acornOptions || {};

    if (!acornOptions.sourceFile)
        acornOptions.sourceFile = this.sourcePath;

    if (this.options.sourceMap && !acornOptions.locations)
        acornOptions.locations = true;

    // We never want (line:column) in the error messages
    acornOptions.lineNoInErrorMessage = false;

    var issues = null;

    try
    {
        var ast = acorn.parse(source, acornOptions),
            destPath = this.getDestPath(sourcePath);

        this.compiler = new compiler.Compiler(source, sourcePath, destPath, ast, this.options);
        this.compiler.compileWithFormat(codeGenerator);
        issues = this.compiler.getIssues();

        if (!this.options.silent && this.compiler.getErrorCount() === 0)
            this.generate(sourcePath, destPath);
    }
    catch (ex)
    {
        if (ex instanceof exceptions.CompileAbortedError)
            error = ex;
        else if (!this.compiler && ex instanceof SyntaxError) // acorn error
            issues = [this.acornToCompilerError(ex)];
        else
            throw ex;
    }

    if (this.compiler && issues === null)
        issues = this.compiler.getIssues();

    var exitCode = exports.EXIT_STATUS_SUCCESS;

    if (issues && issues.length > 0)
    {
        if (this.compiler)
            exitCode = this.compiler.getErrorCount() > 0 ? exports.EXIT_STATUS_ERRORS : exports.EXIT_STATUS_WARNINGS;
        else
            exitCode = exports.EXIT_STATUS_ERRORS;

        if (!this.options.silent)
        {
            var Reporter;

            if (this.options.reporter)
                Reporter = this.options.reporter;
            else
                Reporter = reporters.StandardReporter;

            var reporter = new Reporter(this.options.colorize);

            reporter.report(issues);

            if (error)
                console.log("Compilation aborted, " + error.message + ".");
        }
    }

    return exitCode;
};

Runner.prototype.acornToCompilerError = function(error)
{
    // Make a fake node object that contains the start position of the error
    var node = { start: error.lineStart + error.column },
        message = error.message.charAt(0).toLowerCase() + error.message.substr(1);

    return compiler.Compiler.makeIssue(
                exceptions.CompilerError,
                this.source,
                this.sourcePath,
                node,
                [message]);
};
