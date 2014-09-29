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

exports.compiledFixture = function(name)
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
                    reporter: reporter.SilentReporter
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

exports.fixture = function(name)
{
    var fixturePath = path.join("test", "fixtures", name + ".js");

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
    exports.compiledFixture(fixture).should.equal(exports.fixture(fixture));
};
