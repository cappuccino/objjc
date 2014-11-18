/*
 * utils.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var grunt = require("grunt"),
    path = require("path"),
    reporter = require("../../lib/reporter"),
    Runner = require("../../lib/runner");

require("chai").should();

exports.compiledFixture = function(name, options)
{
    if (path.extname(name) === "")
        name += ".j";

    var sourcePath = path.join("test", "fixtures", name);

    if (grunt.file.exists(sourcePath))
    {
        options = options || {};

        var hook;

        try
        {
            if (options.captureStdout)
                hook = exports.captureStream(process.stdout, true);

            var options = {
                    sourceMap: false,
                    acornOptions: {},
                    quiet: true,
                    reporter: options.captureStdout ? reporter.StandardReporter : reporter.SilentReporter
                },
                runner = new Runner(options);

            runner.compileFile(sourcePath);

            var stdout;

            if (hook)
            {
                stdout = hook.captured();
                hook.unhook();
            }
            else
                stdout = "";

            var compiler = runner.getCompiler();

            return {
                code: compiler ? compiler.code() : "",
                stdout: stdout
            };
        }
        catch (ex)
        {
            if (hook)
                hook.unhook();

            console.error(ex.message);
        }
    }
    else
        console.error("No such fixture: " + sourcePath);

    return { code: "", stdout: "" };
};

exports.readFixture = function(name)
{
    var extension = path.extname(name),
        filename = extension ? name : name + ".js",
        fixturePath = path.join("test", "fixtures", filename);

    if (grunt.file.exists(fixturePath))
    {
        try
        {
            return grunt.file.read(fixturePath);
        }
        catch (ex)
        {
            console.error(ex.message);
        }
    }
    else
        console.error("No such fixture: " + fixturePath);

    return "";
};

exports.compareWithFixture = function(fixture)
{
    exports.compiledFixture(fixture).code.should.equal(exports.readFixture(fixture));
};

exports.captureStream = function(stream, silent)
{
    var oldWrite = stream.write,
        buffer = "";

    stream.write = function(chunk)
    {
        buffer += chunk.toString(); // chunk is a String or Buffer

        if (!silent)
            oldWrite.apply(stream, arguments);
    };

    return {
        unhook: function unhook()
        {
            stream.write = oldWrite;
        },
        captured: function()
        {
            return buffer;
        }
    };
};

/* global describe, it */
/* jshint loopfunc: true */
/* eslint-disable max-nested-callbacks, no-loop-func */

exports.makeDescribes = function(data, pathPrefix)
{
    for (var i = 0; i < data.length; ++i)
    {
        var info = data[i],
            description = info[0],
            should = info[1],
            fixture = path.join(pathPrefix, info[2]);

        describe(description, function()
        {
            it(should, function()
            {
                exports.compareWithFixture(fixture);
            });
        });
    }
};
