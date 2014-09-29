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

exports.compiledFixture = function(name, captureWarnings)
{
    var sourcePath = path.join("test", "fixtures", name + ".j");

    if (grunt.file.exists(sourcePath))
    {
        try
        {
            var options = {
                    sourceMap: false,
                    acornOptions: {},
                    silent: true,
                    reporter: captureWarnings ? reporter.StandardReporter : reporter.SilentReporter
                },
                runner = new Runner(options);

            runner.compileFiles([sourcePath]);

            return runner.getCompiler().code();
        }
        catch (ex)
        {
            console.error(ex.message);
        }
    }
    else
        console.error("No such fixture: " + sourcePath);

    return "";
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
    exports.compiledFixture(fixture).should.equal(exports.readFixture(fixture));
};

exports.captureStream = function(stream)
{
    var oldWrite = stream.write,
        buf = "";

    stream.write = function(chunk)
    {
        buf += chunk.toString(); // chunk is a String or Buffer
        oldWrite.apply(stream, arguments);
    };

    return {
        unhook: function unhook()
        {
            stream.write = oldWrite;
        },
        captured: function()
        {
            return buf;
        }
    };
};
