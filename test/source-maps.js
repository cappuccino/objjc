"use strict";

/* eslint-disable max-nested-callbacks, no-loop-func */

const
    expect = require("code").expect,
    path = require("path"),
    utils = require("./lib/utils");

const data = [ // jscs: ignore requireMultipleVarDecl
    [
        "source-map option",
        "should generate a properly named source map file with correct file references",
        "source-maps"
    ],
];

function makeDescribe(description, should, prefix)
{
    describe(description, () =>
    {
        it(should, () =>
        {
            const
                options = {
                    sourceMap: true,
                    warnings: "none"
                },
                output = utils.compiledFixture(prefix, options);

            expect(output.code).to.equal(utils.readFixture(prefix + ".js"));
            expect(output.map).to.equal(utils.readFixture(prefix + ".js.map"));
        });
    });
}

describe("Source maps", () =>
{
    for (const info of data)
    {
        const
            description = info[0],
            should = info[1],
            prefix = path.join("source-maps", info[2]);

        makeDescribe(description, should, prefix);
    }
});
