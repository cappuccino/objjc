/*
 * warnings.js
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
    ["@deref", "should check for reference expressions that have side effects and generate an error", "@deref"],
    ["@protocol", "should check for existence and generate an error", "@protocol"],
    ["acorn errors", "should be caught and show where the error occurred", "acorn"],
    ["classes", "should be checked for duplicate methods/ivars and conflicting return/parameter types, and specific warnings should be given", "class-declaration"],
    ["global symbols", "should be checked for redefinition as a different type and specific warnings should be given", "redefinition"],
    ["identifiers", "should be checked for existence and shadowing, and specific warnings should be given", "identifiers"],
    ["ivars and method parameters", "should be checked for unknown types and specific warnings should be given", "protocols"],
    ["protocols", "should be checked for existence and conformance and specific warnings should be given", "protocols"],
];

function makeDescribe(description, should, prefix)
{
    describe(description, function()
    {
        it(should, function()
        {
            var output = utils.compiledFixture(prefix, {captureStdout: true});
            output.stdout.should.equal(utils.readFixture(prefix + ".txt"));
        });
    });
}

describe("Compiler warnings", function()
{
    for (var i = 0; i < data.length; ++i)
    {
        var info = data[i],
            description = info[0],
            should = info[1],
            prefix = path.join("warnings", info[2]);

        makeDescribe(description, should, prefix);
    }
});
