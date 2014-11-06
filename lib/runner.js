/*
 * runner.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var acorn = require("objj-acorn"),
    codeGenerator = require("./code_generator"),
    Compiler = require("./compiler").Compiler,
    exceptions = require("./exceptions"),
    grunt = require("grunt"),
    path = require("path"),
    reporters = require("./reporter");

var EXIT_STATUS_SUCCESS = 0,
    EXIT_STATUS_WARNINGS = 1,
    EXIT_STATUS_ERRORS = 2;

var Runner = function(options)
{
    this.options = options;
    this.compiler = null;
    global.DEBUG = !!options.debug;
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

    if (!grunt.file.exists(targetDir))
        grunt.file.mkdir(targetDir);
    else if (!grunt.file.isDir(targetDir))
        throw new Error("'" + targetDir + "' is not a directory.");
};

Runner.prototype.readMacroPrefix = function()
{
    var prefixPath = path.resolve(this.options.macroPrefix);

    if (!grunt.file.isFile(prefixPath))
        throw new Error("no such macro prefix file: '" + this.options.macroPrefix + "'");

    var prefix = grunt.file.read(prefixPath),
        prefixOptions = { objj: true };

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

Runner.prototype.generate = function(sourceFile, compiler)
{
    var generateCode = !this.options.sourceMapOnly;

    if (this.options.output)
    {
        var outputPath = path.resolve(this.options.output);

        if (this.options.useStdin)
            sourceFile = path.resolve(outputPath);

        var baseFilename = path.basename(sourceFile, path.extname(sourceFile)),
            targetPath;

        if (this.options.useStdin)
            targetPath = path.join(path.dirname(outputPath), baseFilename);
        else
            targetPath = path.join(outputPath, baseFilename);

        var filePath = targetPath + ".js";

        if (generateCode)
            grunt.file.write(filePath, compiler.code());

        if (this.options.sourceMap)
            grunt.file.write(targetPath + ".map", compiler.getSourceMap());
    }
    else if (!this.options.quiet)
    {
        if (generateCode)
            console.log(compiler.code());

        if (this.options.sourceMap)
            console.log(compiler.getSourceMap());
    }
};

Runner.prototype.compileFile = function(file)
{
    return this.compileFiles([file]);
};

Runner.prototype.compileFiles = function(files)
{
    var exitCode = EXIT_STATUS_SUCCESS;

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
    this.sourcePath = sourcePath;

    if (!source)
    {
        if (!grunt.file.exists(sourcePath))
            throw new Error("no such file: " + sourcePath);

        source = grunt.file.read(sourcePath);
    }

    this.source = source;

    var acornOptions = this.options.acornOptions;

    if (!acornOptions.sourceFile)
        acornOptions.sourceFile = this.sourcePath;

    if (this.options.sourceMap && !acornOptions.locations)
        acornOptions.locations = true;

    // We never want (line:column) in the error messages
    acornOptions.lineNoInErrorMessage = false;

    var issues = null,
        error = null;

    try
    {
        var ast = acorn.parse(source, acornOptions);

        this.compiler = new Compiler(source, sourcePath, ast, this.options);
        this.compiler.compileWithFormat(codeGenerator);
        issues = this.compiler.getIssues();

        if (!this.options.silent && this.compiler.getErrorCount() === 0)
            this.generate(sourcePath, this.compiler);
    }
    catch (ex)
    {
        if (ex instanceof exceptions.CompileAbortedError)
            error = ex;
        else if (!this.compiler && ex instanceof SyntaxError)  // acorn error
            issues = [this.acornToCompilerError(ex)];
        else
            throw ex;
    }

    if (this.compiler && issues === null)
        issues = this.compiler.getIssues();

    var exitCode = EXIT_STATUS_SUCCESS;

    if (issues && issues.length > 0)
    {
        if (this.compiler)
            exitCode = this.compiler.getErrorCount() > 0 ? EXIT_STATUS_ERRORS : EXIT_STATUS_WARNINGS;
        else
            exitCode = EXIT_STATUS_ERRORS;

        if (!this.options.silent)
        {
            var Reporter;

            if (this.options.reporter)
                Reporter = this.options.reporter;
            else if (this.options.quiet)
                Reporter = reporters.SilentReporter;
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

    return Compiler.makeIssue(
                    exceptions.CompilerError,
                    this.source,
                    this.sourcePath,
                    node,
                    [message]);
};
