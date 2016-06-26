"use strict";

/* eslint-disable max-nested-callbacks, no-loop-func */

const
    expect = require("code").expect,
    utils = require("./lib/utils.js");

const testData = [ // jscs: ignore requireMultipleVarDecl
    ["accessors", "problems with accessor attributes should generate an error"],
    ["bad-import", "importing a non-existent file should generate a fatal error"],
    ["circular-import", "circular imports should generate a fatal error"],
    ["debugger", "debugger statements should generate a warning"],
    ["dereference", "@deref whose ref is not a simple identifier should generate a warning"],
    ["duplicate-global-symbols", "duplicate global symbol definitions should generate a warning"],
    ["duplicate-ivars", "duplicate ivar definitions should generate an error"],
    ["duplicate-methods", "duplicate method declarations should generate an exception"],
    ["identifiers", "references to unknown identifiers and implicit globals should generate a warning"],
    ["import-parse-error", "the import stack should be printed before acorn parse errors in import files"],
    ["import-scope", "top level vars in imported files are not visible to files that import them"],
    ["import-stack", "the import stack should be printed before the first issue in a series from the same import file"],
    ["method-types", "conflicting/unknown method return/parameter types should generate a warning"],
    ["missing-dependencies", "missing class/protocol dependencies should generate an exception"],
    ["protocol-conformance", "unimplemented required protocol methods should generate a warning"],
    ["read-only-globals", "assigning to a read-only predefined global should generate a warning"],
    ["recursive-import", "importing oneself should generate a fatal error"],
    ["reserved-words", "using a reserved word as a variable name should generate a warning"],
    ["self", "using 'self' outside of a method or as a method/function parameter should generate an exception"],
    ["shadowed-vars", "var declarations that shadow names in outer scopes should generate a warning"],
    ["stdin", "issues generated from stdin should show the filename as '<stdin>'"],
    ["suggestions", "unknown names that differ from known names only in capitalization should give a suggestion"],
    ["super-outside", "using 'super' outside of a method should generate an error"],
    ["super-root", "using 'super' in a root class should generate an error"],
    ["symbol-redefinition", "redefining a global symbol as a different type should generate an error"],
];


/*
 * Strip out all but the filename from the 'sourceFile' property of AST nodes.
 */
function stripPaths(str)
{
    return str.replace(
        /no such file '.+[/\\](.+)'/g,
        (match, filename) => filename
    );
}

function makeTest(description, filename)
{
    specify(description, () =>
    {
        let options = { captureStdout: true };

        if (filename === "stdin")
            options.stdin = true;

        const
            output = utils.compiledFixture(`exceptions/src/${filename}`, options),
            text = stripPaths(utils.convertIssuePathsToPosix(output.stdout));

        expect(text).to.equal(stripPaths(utils.readFixture(`exceptions/dest/${filename}.txt`)));
    });
}

context("Warnings and errors", () =>
{
    for (const info of testData)
    {
        const
            should = info[1],
            filename = info[2] ? info[2] : info[0];

        makeTest(should, filename);
    }
});
