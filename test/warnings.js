/*
 * code_generation.js
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

describe("Compiler warnings", function() {
    describe("identifiers", function() {
        it("should be checked and specific warnings given", function() {
            var output = utils.compiledFixture("identifiers", { captureStdout: true });
            output.stdout.should.equal(utils.readFixture("identifier-warnings.txt"));
        });
    });
});
