/*
 * var.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

/*jshint ignore:start */

var utils = require("./lib/utils"),
    compareWithFixture = utils.compareWithFixture;

require("should");

//noinspection BadExpressionStatementJS
describe("var", function() {
    describe("sequential var statements", function() {
        it("should be separated by a blank line", function()
        {
            compareWithFixture("var-sequence").should.be.ok;
        });
    });

    describe("var statement with multiple declarations", function() {
        it("should be on multiple lines", function()
        {
            compareWithFixture("var-multiple").should.be.ok;
        });
    });
});
