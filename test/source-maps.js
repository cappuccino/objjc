/*
 * source-map.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2015, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

/*global describe, it */
/* jshint loopfunc: true */
/* eslint-disable max-nested-callbacks, no-loop-func */

var path = require("path"),
    utils = require("./lib/utils");

var data = [
    ["source-map option", "should generate a properly named source map file with correct file references", "source-map"],
];

function makeDescribe(description, should, prefix)
{
    describe(description, function()
    {
        it(should, function()
        {
            var options = {
                    sourceMap: true,
                    warnings: "none"
                },
                output = utils.compiledFixture(prefix, options);

            output.code.should.equal(utils.readFixture(prefix + ".js"));
            output.map.should.equal(utils.readFixture(prefix + ".js.map"));
        });
    });
}

describe("Source maps", function()
{
    for (var i = 0; i < data.length; ++i)
    {
        var info = data[i],
            description = info[0],
            should = info[1],
            prefix = path.join("source-maps", info[2]);

        makeDescribe(description, should, prefix);
    }
});
