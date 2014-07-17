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

var severityColorMap = {
    note: "yellow",
    warning: "magenta",
    error: "red"
};

exports.setSeverityColorMap = function(map)
{
    for (var severity in map)
    {
        if (hasOwnProperty(map, severity) && hasOwnProperty(severityColorMap, severity))
            severityColorMap[severity] = map[severity];
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

CompilerIssue.prototype.getMessage = function()
{
    var acorn = require("objj-acorn"),
        chalk = require("chalk"),
        util = require("util"),
        utils = require("./utils");

    if (!messageTemplate)
        messageTemplate = utils.makeTemplate("${data.context} ${data.severity} ${data.message}\n${data.source}\n${data.marks}");

    var info = acorn.getLineInfo(this.source, this.node.start),
        context = chalk.gray(util.format("%s:%d:%d:", this.sourcePath, info.line, info.column + 1)),
        severity = chalk[severityColorMap[this.severity]](this.severity + ":"),
        source = this.source.substring(info.lineStart, info.lineEnd).trimRight(),
        marks = " ".repeat(info.column) + chalk.green("^");

    return messageTemplate(
        {
            context: context,
            severity: severity,
            message: chalk.gray(this.message),
            source: source,
            marks: marks
        }
    );
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
