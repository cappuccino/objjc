"use strict";

/* eslint-disable max-nested-callbacks, no-loop-func */

const
    expect = require("code").expect,
    path = require("path"),
    utils = require("./lib/utils");

const data = [ // jscs: ignore requireMultipleVarDecl
    ["@deref", "should check for reference expressions that have side effects and generate an error"],
    ["@protocol", "should check for existence and generate an error"],
    ["acorn errors", "should be caught and show where the error occurred", "acorn"],
    [
        "classes",
        "should be checked for duplicate methods/ivars, conflicting return/parameter types," +
            " and conflicting accessors, and specific warnings should be given",
        "class-declaration"
    ],
    [
        "global symbols",
        "should be checked for redefinition as a different type and specific warnings should be given",
        "redefinition"
    ],
    ["identifiers", "should be checked for existence and shadowing, and specific warnings should be given"],
    [
        "ivars and method parameters",
        "should be checked for unknown types and specific warnings should be given",
        "protocols"
    ],
    ["protocols", "should be checked for existence and conformance and specific warnings should be given"],
    ["types", "should be known"],
];

function makeDescribe(description, should, prefix)
{
    describe(description, () =>
    {
        it(should, () =>
        {
            const output = utils.compiledFixture(prefix, { captureStdout: true });

            expect(output.stdout).to.equal(utils.readFixture(prefix + ".txt"));
        });
    });
}

describe("Compiler warnings", () =>
{
    for (const info of data)
    {
        const
            description = info[0],
            should = info[1],
            prefix = path.join("warnings", info[2] ? info[2] : info[0]);

        makeDescribe(description, should, prefix);
    }
});
