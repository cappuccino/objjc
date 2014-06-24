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

Object.defineProperties(
    String.prototype, {
        "startsWith": {
            "value": function(string) {
                return this.indexOf(string) === 0;
            },
            "configurable": false,
            "writable": false
        },
        "endsWith": {
            "value": function(string) {
                return this.substr(-string.length) === string;
            },
            "configurable": false,
            "writable": false
        },
        "repeat": {
            "value": function(count) {
                return new Array(count + 1).join(this);
            },
            "configurable": false,
            "writable": false
        }
    }
);

Object.defineProperties(
    Array.prototype, {
        "last": {
            "value": function() {
                return this[this.length - 1];
            },
            "configurable": false,
            "writable": false
        }
    }
);
