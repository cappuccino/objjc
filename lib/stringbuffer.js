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

var sourceMap = require("source-map");


var StringBuffer = function(generateSourceMap, file)
{
    var lengthFunc;

    if (generateSourceMap)
    {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringFromSourceNodes;
        this.empty = true;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        lengthFunc = this.sourceNodeLength;
        this.file = file;
    }
    else
    {
        this.atoms = [];
        this.concat = this.concatString;
        this.toString = this.toStringFromStrings;
        this.isEmpty = this.isEmptyString;
        this.appendStringBuffer = this.appendStringBufferString;
        lengthFunc = this.stringLength;
    }

    Object.defineProperty(this, "length", {
        get: lengthFunc
    });
};

StringBuffer.prototype.toStringFromStrings = function()
{
    return this.atoms.join("");
};

StringBuffer.prototype.toStringFromSourceNodes = function()
{
    return this.rootNode.toStringWithSourceMap({ file: this.file });
};

StringBuffer.prototype.concatString = function(aString)
{
    this.atoms.push(aString);
};

StringBuffer.prototype.concatSourceNode = function(aString, node)
{
    if (node)
    {
        //console.log("Snippet: " + aString + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
        this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, aString));
    }
    else
        this.rootNode.add(aString);

    if (this.empty)
        this.empty = false;
};

StringBuffer.prototype.concatFormat = function(node, scope, key)
{
    if (!key)
        return;

    var format = scope.compiler.format,
        value = format.valueForProperty(scope, node.type, key);

    if (!value)
        return;

    var lines = value.split("\n"),
        lineIndent = StringBuffer.indentation;

    for (var i = 0; i < lines.length; i++)
    {
        var line = lines[i];

        if (line.charAt(0) === "|")
        {
            var numberEnd = line.indexOf("|", 1);

            if (numberEnd === -1)
                numberEnd = line.length;

            var indentAmount = parseInt(line.substring(1, numberEnd), 10);

            if (indentAmount < 0)
                lineIndent = StringBuffer.indentation.substring(StringBuffer.indentSize * -indentAmount);
            else
                lineIndent = StringBuffer.indentation + StringBuffer.indentStep.repeat(indentAmount);

            lines[i] = lineIndent + line.substring(numberEnd);
        }
        else if (i > 0 && (line || i === lines.length - 1))
        {
            // Keep the current indentation
            lines[i] = StringBuffer.indentation + line;
        }
    }

    StringBuffer.indentation = lineIndent;
    this.concat(lines.join("\n"));
};

StringBuffer.prototype.concatWithFormat = function(node, scope, string, format, isAnchorNode)
{
    format = format || string;

    this.concatFormat(node, scope, "before-" + format);
    this.concat(string, isAnchorNode ? node : null);
    this.concatFormat(node, scope, "after-" + format);
};

StringBuffer.prototype.concatWithFormats = function(node, scope, before, string, after, isAnchorNode)
{
    if (before)
        this.concatFormat(node, scope, before);

    this.concat(string, isAnchorNode ? node : null);

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
};

StringBuffer.prototype.isEmptyString = function()
{
    return this.atoms.length === 0;
};

StringBuffer.prototype.isEmptySourceNode = function()
{
    return this.empty;
};

StringBuffer.prototype.appendStringBufferString = function(stringBuffer)
{
    this.atoms.push.apply(this.atoms, stringBuffer.atoms);
};

StringBuffer.prototype.appendStringBufferSourceNode = function(stringBuffer)
{
    this.rootNode.add(stringBuffer.rootNode);
};

StringBuffer.prototype.stringLength = function()
{
    return this.atoms.length;
};

StringBuffer.prototype.sourceNodeLength = function()
{
    return this.rootNode.children.length;
};

StringBuffer.setIndent = function(string, width)
{
    StringBuffer.indentString = string;
    StringBuffer.indentWidth = width;
    StringBuffer.indentSize = StringBuffer.indentWidth * StringBuffer.indentString.length;
    StringBuffer.indentStep = StringBuffer.indentString.repeat(StringBuffer.indentWidth);
    StringBuffer.indentation = "";
};

StringBuffer.indent = function()
{
    StringBuffer.indentation += StringBuffer.indentStep;
};

StringBuffer.dedent = function()
{
    StringBuffer.indentation = StringBuffer.indentation.substring(StringBuffer.indentSize);
};

exports.StringBuffer = StringBuffer;

Object.defineProperty(
    String.prototype, "indent",
    {
        "value": function()
        {
            return StringBuffer.indentation + this.replace(/\n(?!(?:\n|$))/g, "\n" + StringBuffer.indentation).replace(/→/g, StringBuffer.indentStep);
        },
        "configurable": false,
        "writable": false
    }
);
