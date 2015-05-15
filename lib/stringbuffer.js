/*
 * stringbuffer.js
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

var indentation = require("./indentation"),
    path = require("path"),
    sourceMap = require("source-map");


var StringBuffer = function(compiler)
{
    this.atoms = [];
    this.locations = [];
    this.generateSourceMap = compiler.options.sourceMap;
    this.sourceMap = null;

    if (this.generateSourceMap)
    {
        // File paths aren't very useful in a source map.
        // So we will assume the source root is valid and use the filename.
        this.sourcePath = path.basename(compiler.sourcePath);

        this.sourceMapGenerator = new sourceMap.SourceMapGenerator(
            {
                sourceRoot: compiler.options.sourceRoot
            }
        );
    }
    else
        this.sourceMapGenerator = null;
};

exports.StringBuffer = StringBuffer;

Object.defineProperty(
    StringBuffer.prototype, "length", {
        get: function()
        {
            return this.atoms.length;
        }
    }
);

StringBuffer.prototype.toString = function()
{
    // Trim whitespace at the beginning
    for (var i = 0; i < this.atoms.length; i++)
    {
        if (/^\s+$/.test(this.atoms[i]))
            this.atoms[i] = "";
        else
            break;
    }

    return this.atoms.join("");
};

StringBuffer.prototype.concat = function(string, node)
{
    this.atoms.push(string);

    if (this.generateSourceMap)
        this.locations.push(node ? { line: node.loc.start.line, column: node.loc.start.column } : null);
};

StringBuffer.prototype.remove = function(index)
{
    this.atoms[index] = "";

    // Mark the node undefined so it won't be used
    if (this.generateSourceMap)
        this.locations[index] = null;
};

var advancePosition = function(position, string)
{
    var lastPos = 0;

    while (true)
    {
        var pos = string.indexOf("\n", lastPos);

        if (pos >= 0)
        {
            ++position.line;
            position.column = 0;
            lastPos = pos + 1;
        }
        else
        {
            position.column += string.length - lastPos;
            break;
        }
    }
};

StringBuffer.prototype.getSourceMap = function()
{
    if (this.generateSourceMap && !this.sourceMap)
    {
        var position = { line: 1, column: 0 };

        for (var i = 0; i < this.locations.length; i++)
        {
            var location = this.locations[i];

            if (location)
            {
                this.sourceMapGenerator.addMapping({
                    source: this.sourcePath,
                    original: {
                        line: location.line,
                        column: location.column
                    },
                    generated: {
                        line: position.line,
                        column: position.column
                    }
                });
            }

            advancePosition(position, this.atoms[i]);
        }

        this.sourceMap = this.sourceMapGenerator.toString();
    }

    return this.sourceMap;
};

StringBuffer.prototype.concatFormat = function(node, scope, selector)
{
    if (!selector)
        return;

    var format = scope.compiler.format,
        value = format.valueForProperty(node, node.type, selector);

    if (!value)
        return;

    var lines = value.split("\n");

    for (var i = 0; i < lines.length; i++)
    {
        var line = lines[i],
            pos = line.indexOf("|");

        if (pos >= 0)
        {
            var indentAmount = parseInt(line.substring(pos + 1), 10);

            if (indentAmount > 0)
                indentation.indent(indentAmount);
            else if (indentAmount < 0)
                indentation.dedent(-indentAmount);

            line = line.substring(0, pos);
        }

        if (i > 0 && (line || i === lines.length - 1))
        {
            // Keep the current indentation
            lines[i] = indentation.indentation + line;
        }
        else
            lines[i] = line;
    }

    this.concat(lines.join("\n"));
};

StringBuffer.prototype.concatWithFormat = function(node, scope, string, format, mapNode)
{
    format = format || string;

    this.concatFormat(node, scope, "before-" + format);
    this.concat(string, mapNode ? node : null);
    this.concatFormat(node, scope, "after-" + format);
};

StringBuffer.prototype.concatWithFormats = function(node, scope, before, string, after, mapNode)
{
    if (before)
        this.concatFormat(node, scope, before);

    this.concat(string, mapNode ? node : null);

    if (after)
        this.concatFormat(node, scope, after);
};

StringBuffer.prototype.concatLeftParens = function(node, scope)
{
    this.concatWithFormat(node, scope, "(", "left-parens");
};

StringBuffer.prototype.concatRightParens = function(node, scope)
{
    this.concatWithFormat(node, scope, ")", "right-parens");
};

StringBuffer.prototype.concatComma = function(node, scope)
{
    this.concatWithFormat(node, scope, ",", "comma");
};

StringBuffer.prototype.concatOperator = function(node, scope, operator)
{
    this.concatWithFormat(node, scope, operator || node.operator, "operator");
};

StringBuffer.prototype.concatParenthesizedBlock = function(node, scope, func)
{
    this.concatWithFormats(node, scope, "before-left-parens", "(", func ? "after-left-parens" : null);

    if (func)
        func();

    this.concatWithFormats(node, scope, func ? "before-left-parens" : null, ")", "after-left-parens");
};

StringBuffer.prototype.concatBuffer = function(buffer)
{
    this.atoms.push.apply(this.atoms, buffer.atoms);
    this.locations.push.apply(this.locations, buffer.locations);
};

StringBuffer.prototype.isEmpty = function()
{
    return this.atoms.length === 0;
};
