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
    sourceMap = require("source-map");


var StringBuffer = function(generateSourceMap, file)
{
    this.atoms = [];
    this.nodes = [];
    this.generateSourceMap = generateSourceMap;
    this.file = file;
    this.sourceMap = null;
    this.rootNode = generateSourceMap ? new sourceMap.SourceNode() : null;
};

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
        this.nodes.push(node || null);
};

StringBuffer.prototype.remove = function(index)
{
    this.atoms[index] = "";

    // Mark the node undefined so it won't be used
    if (this.generateSourceMap)
        this.nodes[index] = undefined;
};

StringBuffer.prototype.getSourceMap = function()
{
    if (this.generateSourceMap && !this.sourceMap)
    {
        if (!this.rootNode)
            this.rootNode = new sourceMap.SourceNode();

        for (var i = 0; i < this.nodes.length; i++)
        {
            var string = this.atoms[i],
                node = this.nodes[i];

            if (node)
            {
                //console.log("Snippet: " + string + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
                this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, string));
            }
            else if (node === null)
                this.rootNode.add(string);
        }

        this.sourceMap = this.rootNode.toStringWithSourceMap({ file: this.file }).map;
    }

    return this.sourceMap;
};

StringBuffer.prototype.concatFormat = function(node, scope, key, virtualType)
{
    if (!key)
        return;

    var format = scope.compiler.format,
        value = format.valueForProperty(scope, virtualType || node.type, key);

    if (!value)
        return;

    var lines = value.split("\n");

    for (var i = 0; i < lines.length; i++)
    {
        var line = lines[i];

        if (line.charAt(0) === "|")
        {
            var indentAmount = parseInt(line.substring(1), 10);

            if (indentAmount > 0)
                indentation.indent(indentAmount);
            else if (indentAmount < 0)
                indentation.dedent(-indentAmount);

            lines[i] = "";
        }
        else if (i > 0 && (line || i === lines.length - 1))
        {
            // Keep the current indentation
            lines[i] = indentation.indentation + line;
        }
    }

    this.concat(lines.join("\n"));
};

StringBuffer.prototype.concatWithFormat = function(node, scope, string, format, isAnchorNode, virtualType)
{
    format = format || string;

    this.concatFormat(node, scope, "before-" + format, virtualType);
    this.concat(string, isAnchorNode ? node : null);
    this.concatFormat(node, scope, "after-" + format, virtualType);
};

StringBuffer.prototype.concatWithFormats = function(node, scope, before, string, after, isAnchorNode, virtualType)
{
    if (before)
        this.concatFormat(node, scope, before, virtualType);

    this.concat(string, isAnchorNode ? node : null);

    if (after)
        this.concatFormat(node, scope, after, virtualType);
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
    this.nodes.push.apply(this.nodes, buffer.nodes);
};

StringBuffer.prototype.isEmpty = function()
{
    return this.atoms.length === 0;
};

module.exports = StringBuffer;
