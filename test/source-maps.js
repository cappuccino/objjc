"use strict";

/* global describe, it */
/* eslint-disable max-nested-callbacks, no-loop-func */

var path = require("path"),
    utils = require("./lib/utils");

// jscs: disable requireMultipleVarDecl

var data = [
    [
        "source-map option",
        "should generate a properly named source map file with correct file references",
        "source-maps"
    ],
];

// jscs: enable

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

            output.code.should.equalFixture(prefix + ".js");
            output.map.should.equalFixture(prefix + ".js.map");
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
