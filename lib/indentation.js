/*
 * indentation.js
 *
 * Created by Martin Carlberg.
 * Copyright 2013, Martin Carlberg.
 *
 * Additional work by Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var Instance = null;

var Indentation = function()
{
    this.indentString = "";
    this.indentWidth = 0;
    this.indentSize = this.indentWidth * this.indentString.length;
    this.indentStep = this.indentString.repeat(this.indentWidth);
    this.indentation = "";
};

var instance = function()
{
    if (!Instance)
        Instance = new Indentation();

    return Instance;
};

Indentation.prototype.setIndent = function(string, width)
{
    this.indentString = string;
    this.indentWidth = width;
    this.indentSize = this.indentWidth * this.indentString.length;
    this.indentStep = this.indentString.repeat(this.indentWidth);
    this.indentation = "";
};

Indentation.prototype.indent = function(count)
{
    this.indentation += this.indentStep.repeat(count || 1);
};

Indentation.prototype.dedent = function(count)
{
    this.indentation = this.indentation.substring(this.indentSize * (count || 1));
};

module.exports = instance();

Object.defineProperty(
    String.prototype, "indent",
    {
        "value": function()
        {
            return Instance.indentation + this.replace(
                /\n(?!(?:\n|$))/g, "\n" + Instance.indentation
            ).replace(/→/g, Instance.indentStep);
        },
        "configurable": false,
        "writable": false
    }
);
