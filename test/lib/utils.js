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

var compiler = require("../../lib/compiler"),
    grunt = require("grunt"),
    path = require("path");

exports.compiledFixture = function(name)
{
    var sourcePath = path.join("test", "fixtures", name + ".j");

    if (grunt.file.exists(sourcePath))
    {
        try
        {
            var options = { sourceMap: false },
                source = grunt.file.read(sourcePath),
                code = compiler.compile(source, sourcePath, options).code();

            return code;
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
        console.error("No such fixture: " + sourcePath);

    return "";
};
