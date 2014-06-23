/*
 * utils.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

/*
    Simplistic implementations of ES6 string methods.
    These are sufficient for our use.
*/

var repeat = function(count)
{
    return new Array(count + 1).join(this);
};

var startsWith = function(string)
{
    return this.indexOf(string) === 0;
};

var endsWith = function(string)
{
    return this.substr(-string.length) === string;
};

var lastElement = function()
{
    return this[this.length - 1];
};

Object.defineProperties(
    String.prototype, {
        "startsWith": {
            "value": startsWith,
            "configurable": false,
            "writable": false
        },
        "endsWith": {
            "value": endsWith,
            "configurable": false,
            "writable": false
        },
        "repeat": {
            "value": repeat,
            "configurable": false,
            "writable": false
        }
    }
);

Object.defineProperties(
    Array.prototype, {
        "last": {
            "value": lastElement,
            "configurable": false,
            "writable": false
        }
    }
)
