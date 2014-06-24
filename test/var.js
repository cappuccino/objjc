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
    compareWithFixture = utils.compareWithFixture,
    expect = require("expect.js");

//noinspection BadExpressionStatementJS
describe("var", function() {
    describe("sequential statements", function() {
        it("should be separated by a blank line", function()
        {
            expect(compareWithFixture("var-sequence")).to.be.ok();
        });
    });

    describe("statement with multiple declarations", function() {
        it("should be on multiple lines", function()
        {
            expect(compareWithFixture("var-multiple")).to.be.ok();
        });
    });
});
