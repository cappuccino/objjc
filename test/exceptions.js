"use strict";

/* eslint-disable max-nested-callbacks, no-loop-func */

const
    expect = require("code").expect,
    utils = require("./lib/utils.js");

const data = [ // jscs: ignore requireMultipleVarDecl
    ["debugger", "debugger statements should generate a warning"],
    ["duplicate-global-symbols", "duplicate global symbol definitions should generate a warning"],
    ["duplicate-methods", "duplicate method declarations should generate an exception"],
    ["read-only-globals", "assigning to a read-only predefined global should generate a warning"],
    ["reserved-words", "using a reserved word as a variable name should generate a warning"],
    ["self", "using 'self' outside of a method or as a method/function parameter should generate an exception"],
    ["shadowed-vars", "var declarations that shadow names in outer scopes should generate a warning"],
    ["super-outside", "using 'super' outside of a method should generate an error"],
    ["super-root", "using 'super' in a root class should generate an error"],
    ["symbol-redefinition", "redefining a global symbol as a different type should generate an error"]
];

function makeTest(should, filename)
{
    it(should, () =>
    {
        const
            output = utils.compiledFixture(`exceptions/src/${filename}`, { captureStdout: true }),
            text = utils.convertToPosixPaths(output.stdout);

        expect(text).to.equal(utils.readFixture(`exceptions/dest/${filename}.txt`));
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
