/*
 * exceptions.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var repeat = require("lodash.repeat"),
    trimRight = require("lodash.trimRight");

var colorMap = {
    note: "yellow",
    warning: "magenta",
    error: "red",
    message: "gray",
    highlight: "green"
};

exports.setColorMap = function(map)
{
    var keys = Object.keys(map);

    for (var i = 0; i < keys.length; ++i)
    {
        var key = keys[i];

        if (colorMap.hasOwnProperty(key))
            colorMap[key] = map[key];
    }
};

var messageTemplate = null;

function initClass(klass, superclass)
{
    klass.prototype = Object.create(superclass.prototype);
    klass.prototype.constructor = klass;
}

var CompilerIssue = function(source, sourcePath, node, message, severity)
{
    this.init(source, sourcePath, node, message, severity);
};

initClass(CompilerIssue, Error);
exports.CompilerIssue = CompilerIssue;

CompilerIssue.prototype.init = function(source, sourcePath, node, message, severity)
{
    this.source = source;
    this.sourcePath = sourcePath;
    this.node = node;
    this.highlightedNodes = [];
    this.message = message || "";
    this.severity = severity;
};

CompilerIssue.prototype.isWarning = function()
{
    return this.severity === "warning";
};

CompilerIssue.prototype.isError = function()
{
    return this.severity === "error";
};

CompilerIssue.prototype.getMessage = function(colorize)
{
    var acorn = require("objj-acorn"),
        chalk = require("chalk"),
        util = require("util"),
        utils = require("./utils");

    colorize = colorize === undefined ? true : !!colorize;
    chalk.enabled = colorize;

    if (!messageTemplate)
        messageTemplate = utils.makeTemplate("${data.context} ${data.severity} ${data.message}\n${data.source}\n${data.highlights}");

    var info = acorn.getLineInfo(this.source, this.node.start),
        context = chalk[colorMap.message](util.format("%s:%d:%d:", this.sourcePath, info.line, info.column + 1)),
        severity = chalk[colorMap[this.severity]](this.severity + ":"),
        source = trimRight(this.source.substring(info.lineStart, info.lineEnd)),
        highlights = repeat(" ", source.length);

    for (var i = 0; i < this.highlightedNodes.length; i++)
    {
        var node = this.highlightedNodes[i];

        // Make sure the highlight is in range of the source line
        if (node.start >= info.lineStart && node.start < (info.lineStart + source.length))
        {
            var offset = node.start - info.lineStart,
                length = node.end - node.start;

            highlights = highlights.substring(0, offset) + repeat("‾", length) + highlights.substring(offset + length);
        }
    }

    highlights = highlights.substring(0, info.column) + "^" + highlights.substring(info.column + 1);

    return messageTemplate(
        {
            context: context,
            severity: severity,
            message: chalk[colorMap.message](this.message),
            source: source,
            highlights: chalk[colorMap.highlight](trimRight(highlights))
        }
    );
};

CompilerIssue.prototype.addHighlight = function(node)
{
    this.highlightedNodes.push(node);
};


var CompilerNote = function(source, file, node, message)
{
    this.init(source, file, node, message, "note");
};

initClass(CompilerNote, CompilerIssue);
exports.CompilerNote = CompilerNote;


var CompilerWarning = function(source, file, node, message)
{
    this.init(source, file, node, message, "warning");
};

initClass(CompilerWarning, CompilerIssue);
exports.CompilerWarning = CompilerWarning;


var CompilerError = function(source, file, node, message)
{
    this.init(source, file, node, message, "error");
};

initClass(CompilerError, CompilerIssue);
exports.CompilerError = CompilerError;


var CompileAbortedError = function()
{
};

initClass(CompileAbortedError, Error);
exports.CompileAbortedError = CompileAbortedError;


var TooManyErrors = function(maxErrors)
{
    this.message = require("util").format("too many errors (>%d)", maxErrors);
};

initClass(TooManyErrors, CompileAbortedError);
exports.TooManyErrors = TooManyErrors;


var InternalError = function()
{
    this.message = "an internal error ocurred";
};

initClass(InternalError, CompileAbortedError);
exports.InternalError = InternalError;

var IdentifierIssue = function(source, file, node, message)
{
    this.init(source, file, node, message);
};

initClass(IdentifierIssue, CompilerIssue);
exports.IdentifierIssue = IdentifierIssue;

var ImplicitGlobalWarning = function(source, file, node, message)
{
    this.init(source, file, node, message, "warning");
};

initClass(ImplicitGlobalWarning, IdentifierIssue);
exports.ImplicitGlobalWarning = ImplicitGlobalWarning;

ImplicitGlobalWarning.prototype.identifierIsValidInScope = function(scope)
{
    var identifier = this.node.name,
        scopeVar = scope.getLocalVar(identifier);

    return scopeVar && !scopeVar.implicit;
};

var UnknownIdentifierWarning = function(source, file, node, message)
{
    this.init(source, file, node, message, "warning");
};

initClass(UnknownIdentifierWarning, IdentifierIssue);
exports.UnknownIdentifierWarning = UnknownIdentifierWarning;

UnknownIdentifierWarning.prototype.identifierIsValidInScope = function(scope)
{
    var identifier = this.node.name;

    return (
        scope.getLocalVar(identifier) ||
        scope.getGlobalVar(identifier) ||
        scope.compiler.getClassDef(identifier)
    );
};

var GlobalIdentifierNote = function(source, file, node, message)
{
    this.init(source, file, node, message, "note");
};

initClass(GlobalIdentifierNote, IdentifierIssue);
exports.GlobalIdentifierNote = GlobalIdentifierNote;
