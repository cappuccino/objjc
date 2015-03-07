/*
 * format.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

/*global describe */

var utils = require("./lib/utils");

var data = [
    ["array expressions", "should have no space around [] and spaces after commas", "array-expression"],
    ["assignments", "should have spaces around = and generate code for @deref", "assignment"],
    ["binary expressions", "should have spaces around operator and remove unnecessary parens", "binary-expression"],
    ["break statements", "should have a space before a label", "break"],
    ["function calls", "should have no space before the argument list, space after the commas", "function-call"],
    ["if/else statements", "should indent non-block dependent statements on next line", "if"],
    ["labels", "should be on a separate line", "labeled"],
    ["JavaScript arrays", "should be one line with a space after commas", "array-expression"],
    ["JavaScript objects", "should have formatted keys and values", "object"],
    ["new statements", "should have formatted arguments and parens", "new"],
    ["sequential var statements", "should be separated by a blank line", "var-sequence"],
    ["statement blocks", "should have braces on separate lines, a blank line after non-nested blocks, and indent nested blocks", "block"],
    ["switch statements", "should have cases and braces on separate lines, and indent cases and their blocks", "switch"],
    ["try statements", "should have braces on separate lines", "try"],
    ["var statement with multiple declarations", "should be on multiple lines", "var-multiple"],
    ["var within a for init", "should be on one line", "var-for"],
    ["with statements", "should indent the dependent statements", "with"],
];

describe("Formatting", function() {
    utils.makeDescribes(data, "formats");
});
