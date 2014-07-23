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
    Compiler = require("../lib/compiler").Compiler,
    grunt = require("grunt"),
    path = require("path"),
    visitors = require("./visitors");

var Runner = function(options)
{
    this.options = options;
    this.compiler = null;
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

    if (!this.options.silent && !this.options.output)
    {
        if (generateCode)
            console.log(compiler.code());

        if (this.options.sourceMap)
            console.log(compiler.getSourceMap());
    }
    else if (this.options.output)
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
};

Runner.prototype.compileFiles = function(files)
{
    this.setupCompile();

    for (var i = 0; i < files.length; i++)
    {
        var sourcePath = path.resolve(files[i]);
        this.compileFileOrSource(sourcePath);
    }
};

Runner.prototype.compileSource = function(sourcePath, source)
{
    this.setupCompile();
    this.compileFileOrSource(sourcePath, source);
};

Runner.prototype.compileFileOrSource = function(sourcePath, source)
{
    if (!source)
    {
        if (!grunt.file.exists(sourcePath))
            throw new Error("no such file: " + sourcePath);

        source = grunt.file.read(sourcePath);
    }

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
        this.compiler.compileWithFormat(visitors.codeGenerator);
        issues = this.compiler.getIssues();

        if (this.compiler.getErrorCount() === 0)
            this.generate(sourcePath, this.compiler);
    }
    catch (ex)
    {
        var exceptions = require("./exceptions");

        if (ex instanceof exceptions.CompileAbortedError)
            error = ex;
        else if (ex instanceof SyntaxError)
            issues = [ex];
        else
            throw ex;
    }

    if (this.compiler && issues === null)
        issues = this.compiler.getIssues();

    if (issues && issues.length > 0)
    {
        var Reporter = require("./reporter"),
            reporter = new Reporter();

        reporter.report(issues);

        if (error)
            console.log("Compilation aborted, " + error.message + ".");
    }
};
