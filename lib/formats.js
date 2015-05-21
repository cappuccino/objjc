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

var fs = require("fs"),
    path = require("path"),
    Scope = require("./scope");

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
    "ElseStatement": "else",
    "EmptyStatement": "empty statement",
    "ExpressionStatement": "expression statement",
    "ForInStatement": "for in",
    "ForStatement": "for",
    "FunctionDeclaration": "function",
    "FunctionExpression": "function expression",
    "GlobalStatement": "@global",
    "Identifier": "identifier",
    "IfStatement": "if",
    "ImportStatement": "@import",
    "IvarDeclaration": "ivar",
    "LabeledStatement": "label",
    "Lambda": "lambda",
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
        formats = fs.readdirSync(formatsPath);

    return formats.filter(function(filename)
        {
            return path.extname(filename) === ".json";
        })
        .map(function(filename)
        {
            return path.basename(filename, path.extname(filename));
        });
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
    var target = this.data[name] || Object.create(null),
        keys = Object.keys(node);

    for (var i = 0; i < keys.length; ++i)
    {
        var key = keys[i];

        target[key] = node[key];

        if (["before", "after"].indexOf(key) >= 0 && typeof target[key] === "string")
            target[key] = { "*": target[key] };
    }

    this.data[name] = target;
};

Format.prototype.valueForProperty = function(node, type, selector)
{
    // Map from AST node types to node item types
    var nodeItemType = typeMap[type];

    if (nodeItemType)
    {
        var nodeItem = this.data[nodeItemType];

        if (nodeItem)
        {
            var value = nodeItem[selector];

            if (typeof value === "object")
                value = this.lookupValue(node, value);

            if (value !== undefined)
                return value;
        }

        return this.globals[selector];
    }

    return null;
};

Format.prototype.getGlobal = function(property)
{
    return this.valueForProperty(null, "*", property);
};

/*
    There are several special keys possible in selectorObject:

        "$previous" - selects the previous statement node
        "$parent" - selects the parent node
        "null" - used if there is no previous statement or parent node
        "*" - fallback if nothing matches
*/
Format.prototype.lookupValue = function(node, selectorObject)
{
    var value,
        fallbackValue,
        type,
        mappedType,
        parentIndex = 0;

    while (true)
    {
        // If we have a specific type we are looking for,
        // see if an item with that type exists.
        if (type)
        {
            mappedType = typeMap[type];

            // If it's a bogus type, bail
            if (!mappedType)
                return null;
        }

        if (mappedType)
        {
            value = selectorObject[mappedType];

            if (typeof value === "object")
            {
                // If the value is an object, go around again
                // with that object as the selector object.
                type = null;
                selectorObject = value;
                continue;
            }
            else if (typeof value === "string")
            {
                // If the value is a string, return it.
                return value;
            }

            // If there is no matching value, try a metatype.
            // If there is a metatype, go around again with that type.
            var metaType = this.metaMap[mappedType];

            if (metaType)
            {
                mappedType = metaType;
                type = null;
                continue;
            }
        }

        // As we descend into nested selector objects,
        // save the most recent fallback item we find.
        var currentFallback = selectorObject["*"];

        if (currentFallback !== undefined)
            fallbackValue = currentFallback;

        // Try $previous first
        value = selectorObject.$previous;

        if (value)
        {
            type = Scope.previousStatementType(node);
        }
        else
        {
            // If $previous fails, try $parent
            value = selectorObject.$parent;

            if (value)
            {
                type = Scope.parentNodeType(node, parentIndex);
                ++parentIndex;
            }
        }

        // If we have $parent or $previous and its value is an object,
        // go around again with that value as the selector object.
        // If we have a string, return it.
        if (typeof value === "object")
        {
            // If there is no previous or parent item, use "null" as the mapped type.
            if (type)
                mappedType = null;
            else
            {
                mappedType = "null";
                type = null;
            }

            selectorObject = value;
            continue;
        }
        else if (typeof value === "string")
        {
            return value;
        }

        break;
    }

    // At this point, we have tried everything. If it failed, try the fallback.
    if (value === undefined)
        value = fallbackValue;

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
        isStandardFormat,
        error;

    formatPath = null;

    if (filePath.indexOf(path.sep) >= 0)
    {
        // Load a user-supplied format
        filePath = path.resolve(filePath);
        formatPath = filePath;
        isStandardFormat = false;
    }
    else
    {
        // Load a standard format
        if (path.extname(filePath) === ".json")
            filePath = path.basename(filePath, ".json");

        formatPath = path.resolve(path.join(__dirname, "..", "formats", filePath + ".json"));
        isStandardFormat = true;
    }

    var format = null;

    try
    {
        var json = fs.readFileSync(formatPath, { encoding: "utf8" });
        format = new Format(JSON.parse(json));
    }
    catch (e)
    {
        if (e.code === "ENOENT")
        {
            error = "no such format '" + filePath + "'\n";

            if (isStandardFormat)
                error += "Available formats: " + availableFormats().join(", ");
        }
        else if (e instanceof SyntaxError)
        {
            error = "invalid JSON in format file '" + formatPath + "'\n" + e.message;
        }
        else
        {
            error = "could not read format file '" + e.message + "'";
        }

        throw new Error(error);
    }

    return format;
};
