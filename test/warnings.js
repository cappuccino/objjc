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
/* jshint loopfunc: true */
/* eslint-disable max-nested-callbacks, no-loop-func */

var path = require("path"),
    utils = require("./lib/utils");

var data = [
    ["identifiers", "should be checked and specific warnings given", "identifiers"]
];

describe("Compiler warnings", function() {

    for (var i = 0; i < data.length; ++i)
    {
        var info = data[i],
            description = info[0],
            should = info[1],
            prefix = path.join("warnings", info[2]);

        describe(description, function() {
            it(should, function() {
                var output = utils.compiledFixture(prefix, { captureStdout: true });
                output.stdout.should.equal(utils.readFixture(prefix + ".txt"));
            });
        });
    }
});
