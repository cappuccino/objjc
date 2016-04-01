"use strict";

/* eslint-disable max-nested-callbacks, no-loop-func */

const
    expect = require("code").expect,
    utils = require("./lib/utils");

const data = [ // jscs: ignore requireMultipleVarDecl
    ["debugger", "debugger statements should generate a warning"],
    ["shadowed-vars", "var declarations that shadow names in outer scopes should generate a warning"]
];

function makeTest(should, filename)
{
    it(should, () =>
    {
        const output = utils.compiledFixture(`exceptions/src/${filename}`, { captureStdout: true });

        expect(output.stdout).to.equal(utils.readFixture(`exceptions/dest/${filename}.txt`));
    });
}

describe("Exceptions", () =>
{
    for (const info of data)
    {
        const
            should = info[1],
            filename = info[2] ? info[2] : info[0];

        makeTest(should, filename);
    }
});
