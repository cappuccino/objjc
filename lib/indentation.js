"use strict";

var repeat = require("lodash.repeat");

// jscs: disable requireMultipleVarDecl

var Instance = null;

var Indentation = function()
{
    this.indentString = "";
    this.indentWidth = 0;
    this.indentSize = this.indentWidth * this.indentString.length;
    this.indentStep = repeat(this.indentString, this.indentWidth);
    this.indentation = "";
};

// jscs: enable

function instance()
{
    if (!Instance)
        Instance = new Indentation();

    return Instance;
}

Indentation.prototype.setIndent = function(string, width)
{
    this.indentString = string;
    this.indentWidth = width;
    this.indentSize = this.indentWidth * this.indentString.length;
    this.indentStep = repeat(this.indentString, this.indentWidth);
    this.indentation = "";
};

Indentation.prototype.indent = function(count)
{
    this.indentation += repeat(this.indentStep, count || 1);
};

Indentation.prototype.dedent = function(count)
{
    this.indentation = this.indentation.substring(this.indentSize * (count || 1));
};

module.exports = instance();

Object.defineProperty(
    String.prototype, "indent",
    {
        value: function()
        {
            return Instance.indentation + this.replace(
                /\n(?!(?:\n|$))/g, "\n" + Instance.indentation
            ).replace(/→/g, Instance.indentStep);
        },
        configurable: false,
        writable: false
    }
);
