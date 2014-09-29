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

/*global describe, it */
/*eslint-disable max-nested-callbacks */

var utils = require("./lib/utils");

describe("Formatting", function() {
    describe("JavaScript array", function() {
        it("should be one line with a space after commas", function() {
            utils.compareWithFixture("array-expression");
        });
    });

    describe("assignment", function() {
        it("should have spaces around = and generate code for @deref", function() {
            utils.compareWithFixture("assignment");
        });
    });

    describe("binary expression", function() {
        it("should have spaces around operator and remove unnecessary parens", function() {
            utils.compareWithFixture("binary-expression");
        });
    });

    describe("statement block", function() {
        it("should have braces on separate lines and indent nested blocks", function() {
            utils.compareWithFixture("block");
        });
    });

    describe("break statement", function() {
        it("should have a space before a label", function() {
            utils.compareWithFixture("break");
        });
    });

    describe("function call", function() {
        it("should have no space before the argument list, space after the commas", function() {
            utils.compareWithFixture("function-call");
        });
    });

    describe("new", function() {
        it("should have formatted arguments and parens", function() {
            utils.compareWithFixture("new");
        });
    });

    describe("sequential var statements", function() {
        it("should be separated by a blank line", function() {
            utils.compareWithFixture("var-sequence");
        });
    });

    describe("var statement with multiple declarations", function() {
        it("should be on multiple lines", function() {
            utils.compareWithFixture("var-multiple");
        });
    });

    describe("var within a for init", function() {
        it("should be on one line", function() {
            utils.compareWithFixture("var-for");
        });
    });
});
