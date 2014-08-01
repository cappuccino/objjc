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

var lodashTemplate = require("lodash-template");

/*
    Simplistic implementations of ES6 string methods.
    These are sufficient for our use.
*/

Object.defineProperties(
    String.prototype,
    {
        "startsWith":
        {
            value: function(string)
            {
                return this.indexOf(string) === 0;
            },
            configurable: false,
            enumerable: false,
            writable: false
        },
        "endsWith":
        {
            value: function(string)
            {
                return this.substr(-string.length) === string;
            },
            configurable: false,
            enumerable: false,
            writable: false
        },
        "repeat":
        {
            value: function(count)
            {
                return new Array(count + 1).join(this);
            },
            configurable: false,
            enumerable: false,
            writable: false
        },
        "capitalize":
        {
            value: function()
            {
                return this.charAt(0).toLocaleUpperCase() + this.substring(1);
            },
            configurable: false,
            enumerable: false,
            writable: false
        },
        "trimRight":
        {
            value: function()
            {
                return this.replace(/\s+$/, "");
            },
            configurable: false,
            enumerable: false,
            writable: false
        }
    }
);

Object.defineProperty(Array.prototype, "last",
{
    value: function()
    {
        return this[this.length - 1];
    },
    configurable: false,
    enumerable: false,
    writable: false
});

Object.merge = function(object, otherObject)
{
    for (var key in otherObject)
    {
        if (!otherObject.hasOwnProperty || otherObject.hasOwnProperty(key))
            object[key] = otherObject[key];
    }

    return object;
};

Object.defineProperty(Object.prototype, "mergeWith",
{
    value: function(object)
    {
        Object.merge(this, object);
    },
    configurable: false,
    enumerable: false,
    writable: false
});

exports.makeTemplate = function(text)
{
    return lodashTemplate(text, null, { variable: "data" });
};

// Convert an array into a hash whose keys are the array elements and values are value || true.
// The hash has no prototype, so 'in' will work but not hasOwnProperty.
exports.arrayToHash = function(array, value)
{
    if (value === undefined)
        value = true;

    var hash = Object.create(null);

    for (var i = 0; i < array.length; i++)
        hash[array[i]] = value;

    return hash;
};

