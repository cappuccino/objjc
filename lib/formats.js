/*
 * formats.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var grunt = require("grunt"),
    path = require("path");

require("./utils");

// Map between AST node types and format node types
var typeMap = {
    "*": "*",  // global properties
    "ArrayExpression": "array",
    "AssignmentExpression": "assignment",
    "BinaryExpression": "binary expression",
    "BlockStatement": "{}",
    "BreakStatement": "break",
    "CallExpression": "function call",
    "ClassDeclaration": "@implementation",
    "ClassStatement": "@class",
    "ContinueStatement": "continue",
    "DebuggerStatement": "debugger",
    "Dereference": "@deref",
    "DictionaryLiteral": "@{}",
    "DoWhileStatement": "do while",
    "ElseIfStatement": "else if",
    "EmptyStatement": "empty statement",
    "ExpressionStatement": "expression statement",
    "ForInit": "for init",
    "ForInStatement": "for in",
    "ForStatement": "for",
    "FunctionDeclaration": "function",
    "FunctionExpression": "function expression",
    "GlobalStatement": "@global",
    "Identifier": "identifier",
    "IdentifierName": "identifier name",
    "IfStatement": "if",
    "ImportStatement": "@import",
    "IvarDeclaration": "ivar",
    "LabeledStatement": "label",
    "Literal": "literal",
    "MemberExpression": "member",
    "MessageSendExpression": "message",
    "MethodDeclaration": "method",
    "NewExpression": "new",
    "ObjectExpression": "object",
    "ObjectiveJType": "objective-j type",
    "Program": "program",
    "ProtocolDeclaration": "@protocol",
    "ProtocolLiteralExpression": "@protocol()",
    "Reference": "@ref",
    "ReturnStatement": "return",
    "SelectorLiteralExpression": "@selector",
    "SequenceExpression": ",",
    "Statement": "statement",
    "SwitchStatement": "switch",
    "TernaryExpression": "ternary expression",
    "ThisExpression": "this",
    "ThrowStatement": "throw",
    "TryStatement": "try",
    "TypeDefStatement": "@typedef",
    "UnaryExpression": "unary expression",
    "UpdateExpression": "update expression",
    "VariableDeclaration": "var",
    "WhileStatement": "while",
    "WithStatement": "with"
};

var availableFormats = function()
{
    // Be nice and show what formats *are* available
    var formatsPath = path.join(__dirname, "..", "formats"),
        formats = [];

    grunt.file.recurse(formatsPath, function(abspath, rootdir, subdir, filename)
    {
        if (filename.endsWith(".json"))
            formats.push(path.basename(filename, path.extname(filename)));
    });

    return formats;
};

/*
    Convert a raw JSON format into a Format object.
*/
var Format = function(format)
{
    // The format data, a hash of node names and format specs
    this.data = Object.create(null);

    // A map between meta node names (e.g. "*block")
    // and a hash of the node names they represent.
    this.metaMap = Object.create(null);

    // Global properties
    this.globals = Object.create(null);

    if (format)
        this.render(format);
};

/*
    To avoid extra lookups for meta nodes, we render the meta
    nodes into real nodes.
*/
Format.prototype.render = function(format)
{
    // Render meta nodes
    for (var key in format)
    {
        var currentNode = format[key];

        if (key === "*")
        {
            this.cloneNode(currentNode, "*");
            this.globals = this.data["*"];
            continue;
        }
        else if (!format.hasOwnProperty(key))
            continue;

        if (key.charAt(0) === "*" && key.length > 1)
        {
            var nodes = currentNode.nodes || [];

            // Remove nodes array so we can clone the rest of the properties
            delete currentNode.nodes;

            /*eslint-disable no-loop-func */
            nodes.forEach(function(name) {
                this.cloneNode(currentNode, name);
                this.metaMap[name] = key;
            }, this);  // jshint ignore:line
            /*elsint-enable */
        }
        else
        {
            this.cloneNode(currentNode, key);
        }
    }
};

/*
    If no data node with the given name exists, create it and copy node.
    Otherwise merge node with the existing data node.
*/
Format.prototype.cloneNode = function(node, name)
{
    var target = this.data[name] || Object.create(null);

    for (var key in node)
    {
        if (node.hasOwnProperty(key))
        {
            target[key] = node[key];

            if (["before", "after"].indexOf(key) >= 0 && typeof target[key] === "string")
                target[key] = { "*": target[key] };
        }
    }

    this.data[name] = target;
};

Format.prototype.valueForProperty = function(scope, type, key)
{
    // Map from acorn node types to our node types
    var mappedType = typeMap[type];

    if (mappedType)
    {
        var node = this.data[mappedType];

        if (node && key in node)
        {
            var value = node[key];

            /*
                If key starts with "before" or "after", the value might be a hash which tells
                us what value to return. For "before", we check the previous or parent node.
                For "after", we check the parent node.
            */
            if (typeof value === "object")
            {
                var otherType;

                if (key.startsWith("before"))
                    otherType = scope.previousStatementType();
                else if (key.startsWith("after"))
                    otherType = scope.parentType();

                value = this.lookupValue(otherType || "*parent", value);
            }

            return value;
        }

        return this.globals[key];
    }

    return null;
};

/*
    Given a type name and a hash of possible type names, find the matching item:

    - Look for an exact match for type in the hash.
    - If that fails, see if type is in a meta type. If so, look for that meta type in the hash.
    - If that fails, look for "*" in the hash.
*/
Format.prototype.lookupValue = function(type, hash)
{
    var value = null,
        mappedType = type.charAt(0) === "*" ? type : typeMap[type];

    if (mappedType in hash)
        value = hash[mappedType];
    else
    {
        var metaType = this.metaMap[mappedType];

        if (metaType && metaType in hash)
            value = hash[metaType];
        else if ("*" in hash)
            value = hash["*"];
    }

    return value;
};

/*
    Load the format at the given path. If the path contains a directory
    separator, the file at the given path is loaded. Otherwise the named
    format is loaded from the formats directory. In either case, if the
    load is successful, the format specification object is returned.
    If there are errors, an Error is thrown.
*/
exports.load = function(formatPath)
{
    var filePath = formatPath,
        error = null;

    formatPath = null;

    if (filePath.indexOf(path.sep) >= 0)
    {
        // Load a user-supplied format
        filePath = path.resolve(filePath);

        if (grunt.file.isFile(filePath))
            formatPath = filePath;
        else
            error = "no such format file: " + filePath;
    }
    else
    {
        // Load a standard format
        if (path.extname(filePath) === ".json")
            filePath = path.basename(filePath, ".json");

        formatPath = path.resolve(path.join(__dirname, "..", "formats", filePath + ".json"));

        if (!grunt.file.isFile(formatPath))
        {
            error = "no such format: \"" + filePath + "\"\n";
            error += "Available formats: " + availableFormats().join(", ");
        }
    }

    var format = null;

    if (!error)
    {
        try
        {
            if (grunt.file.isFile(formatPath))
            {
                var json = grunt.file.readJSON(formatPath);
                format = new Format(json);
            }
            else
                error = "not a file: " + formatPath;
        }
        catch (e)
        {
            error = "invalid JSON in format file: " + formatPath + "\n" + e.message;
        }
    }

    if (error)
        throw new Error(error);

    return format;
};
