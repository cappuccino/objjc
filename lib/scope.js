/*
 * scope.js
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

/*eslint-disable consistent-this */

var utils = require("./utils");

var statementNodeTypes = utils.arrayToHash([
        "BreakStatement",
        "ClassStatement",
        "ContinueStatement",
        "DebuggerStatement",
        "ExpressionStatement",
        "GlobalStatement",
        "IVarDeclaration",
        "LabeledStatement",
        "ReturnStatement",
        "ThrowStatement",
        "TypeDefStatement",
    ]),

    parentNodeTypes = utils.arrayToHash([
        "BlockStatement",
        "ClassDeclaration",
        "DoWhileStatement",
        "ElseIfStatement",
        "ElseStatement",
        "ForInStatement",
        "ForStatement",
        "FunctionDeclaration",
        "FunctionExpression",
        "IfStatement",
        "Lambda",
        "MethodDeclaration",
        "ObjectExpression",
        "Program",
        "ProtocolDeclaration",
        "SwitchStatement",
        "VariableDeclaration",
        "WhileStatement",
        "WithStatement",
    ]),

    globalVarTypes = utils.arrayToHash([
        "global var",
        "@global",
        "implicit global"
    ]);

var Scope = function(parent, properties)
{
    this.vars = Object.create(null);

    if (properties)
        this.mergeWith(properties);

    this.parent = parent;

    if (parent)
    {
        this.compiler = parent.compiler;

        var self = this;

        while (self.parent)
            self = self.parent;

        this.root = self;
    }
    else
        this.root = this;
};

module.exports = Scope;

Scope.statementNodes = [];
Scope.parentNodes = [];

Scope.pushNode = function(node)
{
    /*
        We keep track of two things:

        - A stack of parent node types.
        - A list of statements types within a parent.

        This allows us to know what the previous statement
        at the current level is, which is used for formatting.
    */
    if (node.type in parentNodeTypes)
    {
        // Parent nodes are also statements, so push this node type onto the list of statements
        // for the previous parent, then start a new list.
        var parent = this.parentNodes.last();

        if (parent)
            parent.statementNodes.push(node);

        parent = {
            node: node,
            statementNodes: []
        };

        this.parentNodes.push(parent);
        this.statementNodes = parent.statementNodes;
    }
    else if (node.type in statementNodeTypes)
        this.statementNodes.push(node);

    if (DEBUG)
    {
        var debugPrevious = this.previousStatementType(node),
            debugParent = this.parentNodeType(node);

        console.log(
            "%s, <%s, ^%s",
            node.type,
            debugPrevious || "null",
            debugParent || "null"
        );
    }
};

Scope.popNode = function(node)
{
    if (node.type in parentNodeTypes)
    {
        // If the node is a parent, pop it and set the statement list
        // to the previous parent's list.
        this.parentNodes.pop();

        var parent = this.parentNodes.last();

        if (parent)
            this.statementNodes = parent.statementNodes;
    }
};

Scope.previousStatementType = function(node)
{
    // If the current node is a parent, look at its parent's statements
    var isParent = node && node.type in parentNodeTypes,
        previous,
        statementNodes;

    if (isParent)
    {
        var parent = this.parentNodes[this.parentNodes.length - 2];

        if (parent)
            statementNodes = parent.statementNodes;
    }
    else
        statementNodes = this.statementNodes;

    if (statementNodes)
    {
        // The current statement is the top of the stack, so go one below that
        var index = 1;

        if (isParent || (node && node.type in statementNodeTypes))
            ++index;

        previous = statementNodes[statementNodes.length - index];
    }

    return previous ? previous.type : null;
};

// index is zero-based positive number from end of stack
Scope.parentNodeType = function(node, index)
{
    // The current parent is the top of the stack, so go one below that
    index = index || 0;

    if (node && node.type in parentNodeTypes)
        ++index;

    var parent = this.parentNodes[this.parentNodes.length - (1 + index)];

    return parent ? parent.node.type : null;
};

Scope.prototype.close = function()
{
    if (this.maxReceiverLevel)
    {
        var buffer = this.compiler.jsBuffer;

        buffer.concat("\n\n// Generated receiver temp variables\nvar ".indent());

        for (var i = 0; i < this.maxReceiverLevel; i++)
        {
            if (i > 0)
                buffer.concat(", ");

            buffer.concat("__r" + (i + 1));
        }

        buffer.concat(";");
    }

    delete this.receiverLevel;
    delete this.maxReceiverLevel;
};

Scope.prototype.toString = function()
{
    return this.ivars ? "ivars: " + JSON.stringify(this.ivars) : "<No ivars>";
};

Scope.prototype.getCompiler = function()
{
    return this.compiler;
};

Scope.prototype.rootScope = function()
{
    return this.root;
};

Scope.prototype.isRootScope = function()
{
    return !this.parent;
};

Scope.prototype.isLocalScope = function()
{
    return !!this.parent;
};

Scope.prototype.currentClassName = function()
{
    var self = this;

    while (self && !self.classDef)
        self = self.parent;

    return self ? self.classDef.name : null;
};

Scope.prototype.currentProtocolName = function()
{
    var self = this;

    while (self && !self.protocolDef)
        self = self.parent;

    return self ? self.protocolDef.name : null;
};

Scope.prototype.getIvarForCurrentClass = function(/* String */ ivarName)
{
    if (this.ivars)
    {
        var ivar = this.ivars[ivarName];

        if (ivar)
            return ivar;
    }

    var parent = this.parent;

    // Stop at the class declaration
    if (parent && !this.classDef)
        return parent.getIvarForCurrentClass(ivarName);

    return null;
};

Scope.prototype.addIvarRef = function(node, identifier, ivar)
{
    var compiler = this.compiler,
        buffer = compiler.jsBuffer;

    // Save the index of where the "self." string is stored along with the node.
    // These will be used if we find a variable declaration that is hoisting this identifier.
    if (!this.ivarRefs)
        this.ivarRefs = Object.create(null);

    if (!(identifier in this.ivarRefs))
        this.ivarRefs[identifier] = [];

    this.ivarRefs[identifier].push(
        {
            ivar: ivar.node,
            node: node,
            index: buffer.length
        }
    );

    buffer.concat("self.", node);
};

Scope.prototype.getVar = function(/* String */ name, localOnly)
{
    if (this.vars)
    {
        var lvar = this.vars[name];

        if (lvar)
            return lvar;
    }

    if (!localOnly)
    {
        var parent = this.parent;

        if (parent)
            return parent.getVar(name, localOnly);
    }

    return null;
};

Scope.prototype.getLocalVar = function(/* String */ name)
{
    return this.getVar(name, true);
};

Scope.prototype.getGlobalVar = function(/* String */ name)
{
    var global = this.rootScope().vars[name];

    if (global && (global.type in globalVarTypes))
        return global;

    return null;
};

Scope.prototype.currentMethodType = function()
{
    var self = this;

    while (self && !self.methodType)
        self = self.parent;

    return self ? self.methodType : null;
};

Scope.prototype.copyIvarRefsToParent = function()
{
    if (this.parent && this.ivarRefs)
    {
        for (var key in this.ivarRefs)
        {
            var ivarRef = this.ivarRefs[key];

            if (!this.parent.ivarRefs)
                this.parent.ivarRefs = Object.create(null);

            if (!(key in this.parent.ivarRefs))
                this.parent.ivarRefs[key] = [];

            var parentIvarRefs = this.parent.ivarRefs[key];

            // Append at end in parent scope
            parentIvarRefs.push.apply(parentIvarRefs, ivarRef);
        }
    }
};
