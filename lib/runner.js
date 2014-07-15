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
    compiler = require("../lib/compiler.js"),
    grunt = require("grunt"),
    path = require("path"),
    Reporter = require("./reporter");

var Runner = function(options)
{
    this.options = options;
    this.reporter = new Reporter();
};

module.exports = Runner;

Runner.prototype.makeOutputDir = function()
{
    var outputPath = path.resolve(this.options.output),
        targetDir = this.options.useStdin ? path.dirname(outputPath) : outputPath;

    if (!grunt.file.exists(targetDir))
        grunt.file.mkdir(targetDir);
    else if (!grunt.file.isDir(targetDir))
        throw new Error("'" + targetDir + "' is not a directory");
};

Runner.prototype.readPrefix = function()
{
    var prefixPath = path.resolve(this.options.prefix);

    if (!grunt.file.isFile(prefixPath))
        throw new Error("No such prefix file: '" + this.options.prefix + "'");

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

    if (this.options.prefix)
        this.readPrefix();
};

Runner.prototype.generate = function(sourceFile, compiled)
{
    var generateCode = !this.options.sourceMapOnly;

    if (!this.options.silent && !this.options.output)
    {
        if (generateCode)
            console.log(compiled.code());

        if (this.options.sourceMap)
            console.log(compiled.map());
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
            grunt.file.write(filePath, compiled.code());

        if (this.options.sourceMap)
            grunt.file.write(targetPath + ".map", compiled.map());
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
            throw new Error("No such file: " + sourcePath);

        source = grunt.file.read(sourcePath);
    }

    var compiled = compiler.compile(source, sourcePath, this.options);

    this.generate(sourcePath, compiled);
    //this.reporter.report(compiled.issues);
};
