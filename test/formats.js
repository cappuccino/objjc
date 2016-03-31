"use strict";

const utils = require("./lib/utils");

const data = [ // jscs: ignore requireMultipleVarDecl
    ["assignments", "should have spaces around = and generate code for @deref"],
    ["binary expressions", "should have spaces around operator and remove unnecessary parens"],
    ["break statements", "should have a space before a label"],
    ["function calls", "should have no space before the argument list, space after the commas"],
    ["if-else statements", "should indent non-block dependent statements on next line", "if"],
    ["labels", "should be on a separate line"],
    ["lambda functions", "should be on a single line"],
    ["JavaScript arrays", "should have no space around [] and spaces after commas"],
    ["JavaScript objects", "should have formatted keys and values"],
    ["new statements", "should have formatted arguments and parens"],
    ["sequential var statements", "should be separated by a blank line", "var-sequence"],
    [
        "block statements",
        "should have braces on separate lines, a blank line after non-nested blocks," +
        " and indent nested blocks"
    ],
    ["switch statements", "should have cases and braces on separate lines, and indent cases and their blocks"],
    ["try statements", "should have braces on separate lines"],
    ["var statement with multiple declarations", "should be on multiple lines", "var-multiple"],
    ["var within a for init", "should be on one line", "var-for"],
    ["with statements", "should indent the dependent statements"],
];

describe("Formatting", () => utils.makeDescribes(data, "formats"));
