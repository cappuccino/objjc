/*
 * formatting.js
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
    ["assignment", "should have spaces around = and generate code for @deref", "assignment"],
    ["binary expression", "should have spaces around operator and remove unnecessary parens", "binary-expression"],
    ["break statement", "should have a space before a label", "break"],
    ["JavaScript array", "should be one line with a space after commas", "array-expression"],
    ["function call", "should have no space before the argument list, space after the commas", "function-call"],
    ["new", "should have formatted arguments and parens", "new"],
    ["sequential var statements", "should be separated by a blank line", "var-sequence"],
    ["statement block", "should have braces on separate lines and indent nested blocks", "block"],
    ["var statement with multiple declarations", "should be on multiple lines", "var-multiple"],
    ["var within a for init", "should be on one line", "var-for"],
];

describe("Formatting", function() {
    utils.makeDescribes(data, "format");
});
