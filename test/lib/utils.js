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
    fs = require("fs"),
    path = require("path");

exports.compareWithFixture = function(filename)
{
    var sourcePath = path.join("test", "fixtures", filename + ".j"),
        fixturePath = path.join("test", "fixtures", filename + ".js");

    if (fs.existsSync(sourcePath))
    {
        try
        {
            var options = { sourceMap: false },
                source = fs.readFileSync(sourcePath, "utf-8"),
                code = compiler.compile(source, sourcePath, options).code(),
                fixture = fs.readFileSync(fixturePath, "utf-8");

            return code === fixture;
        }
        catch (ex)
        {
            console.error(ex.message);
        }
    }

    return false;
};
