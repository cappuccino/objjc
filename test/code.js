/*
 * code.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

/* global describe */

var utils = require("./lib/utils");

var data = [
    ["@[] array literals", "should generate Objective-J code", "array-literals"],
    ["@{} dictionary literals", "should generate Objective-J code", "dictionary-literals"],
    ["@protocol", "should generate objj_getProtocol calls", "@protocol"],
    ["@ref / @deref", "should generate a function for @ref, function calls for @deref, and correctly deal with pre- or post-increment/decrement", "references"],
    ["@selector", "should generate sel_getUid calls"],
    ["accessors", "should be generated according to attributes"],
    ["binary expressions", "should have redundant parentheses removed"],
    ["class declarations", "should generate well-formatted and commented code for ivars, instance methods and class methods"],
    ["literals", "should generate regular Javascript literals"],
    ["message sends", "should generate msgSend[N] calls and receiver temp vars in the proper scope"],
    ["protocols", "should generate well-formatted and commented code"],
];

describe("Code generation", function() {
    utils.makeDescribes(data, "code");
});
