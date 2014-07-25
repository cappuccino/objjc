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

var utils = require("./utils");

var statementNodeTypes = utils.arrayToHash([
        "ExpressionStatement",
        "VariableDeclaration",
        "LabeledStatement",
        "BreakStatement",
        "ContinueStatement",
        "ReturnStatement",
        "DebuggerStatement",
        "IVarDeclaration",
        "ThrowStatement"
    ]),

    parentNodeTypes = utils.arrayToHash([
        "Program",
        "WhileStatement",
        "DoWhileStatement",
        "ForStatement",
        "ForInit",
        "ForInStatement",
        "BlockStatement",
        "WithStatement",
        "IfStatement",
        "SwitchStatement",
        "ClassDeclaration",
        "ProtocolDeclaration",
        "MethodDeclaration",
        "FunctionDeclaration",
        "FunctionExpression"
    ]);

var Scope = function(prev, base)
{
    this.vars = Object.create(null);

    if (base)
        for (var key in base)
            if (base.hasOwnProperty(key))
                this[key] = base[key];

    this.prev = prev;

    if (prev)
        this.compiler = prev.compiler;

    this.conditionalWarningList = [];
    this.statementNodes = [];
    this.parentNodes = [];
};

module.exports = Scope;

Scope.prototype.toString = function()
{
    return this.ivars ? "ivars: " + JSON.stringify(this.ivars) : "<No ivars>";
};

Scope.prototype.compiler = function()
{
    return this.compiler;
};

Scope.prototype.rootScope = function()
{
    var self = this;

    while (self.prev)
        self = self.prev;

    return self;
};

Scope.prototype.isRootScope = function()
{
    return !this.prev;
};

Scope.prototype.currentClassName = function()
{
    var self = this;

    while (self && !self.classDef)
        self = self.prev;

    return self ? self.classDef.name : null;
};

Scope.prototype.currentProtocolName = function()
{
    var self = this;

    while (self && !self.protocolDef)
        self = self.prev;

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

    var prev = this.prev;

    // Stop at the class declaration
    if (prev && !this.classDef)
        return prev.getIvarForCurrentClass(ivarName);

    return null;
};

Scope.prototype.getLocalVar = function(/* String */ name, stopAtMethod)
{
    if (this.vars)
    {
        var lvar = this.vars[name];

        if (lvar)
            return lvar;
    }

    var prev = this.prev;

    // Stop at the method declaration
    if (prev && (!stopAtMethod || !this.methodType))
        return prev.getLocalVar(name, stopAtMethod);

    return null;
};

Scope.prototype.currentMethodType = function()
{
    var self = this;

    while (self && !self.methodType)
        self = self.prev;

    return self ? self.methodType : null;
};

Scope.prototype.copyIvarRefsToParent = function()
{
    if (this.prev && this.ivarRefs)
    {
        for (var key in this.ivarRefs)
        {
            var ivarRef = this.ivarRefs[key];

            if (!this.prev.ivarRefs)
                this.prev.ivarRefs = Object.create(null);

            if (!(key in this.prev.ivarRefs))
                this.prev.ivarRefs[key] = [];

            var scopeIvarRefs = this.prev.ivarRefs[key];

            // Append at end in parent scope
            scopeIvarRefs.push.apply(scopeIvarRefs, ivarRef);
        }
    }
};

Scope.prototype.addConditionalWarning = function(warning)
{
    this.rootScope().conditionalWarningList.push(warning);
};

Scope.prototype.conditionalWarnings = function()
{
    return this.rootScope().conditionalWarningList;
};

Scope.prototype.pushNode = function(node, virtualType)
{
    var type = virtualType || node.type;

    console.log(
        "-> %s, %s, %s",
        type,
        this.previousStatementNode() ? this.previousStatementNode().type : "null",
        this.parentNode() ? this.parentNode().type : "null"
    );

    /*
        We keep track of two things:

        - A stack of parent nodes.
        - A list of statements within a parent.

        This allows us to know what the previous statement
        at the current level is, which is used for formatting.
    */
    if (type in parentNodeTypes)
    {
        // Parent nodes are also statements, so push this node onto the list of statements
        // for the previous parent, then start a new list.
        this.statementNodes.push(node);
        this.statementNodes = [];
        this.parentNodes.push({
            node: node,
            statementNodes: this.statementNodes
        });
    }
    else if (type in statementNodeTypes)
        this.statementNodes.push(node);
};

Scope.prototype.popNode = function(node, virtualType)
{
    var type = virtualType || node.type;

    if (type in parentNodeTypes)
    {
        // If the node is a parent, pop it and set the statement list
        // to the previous parent.
        this.parentNodes.pop();

        var parent = this.parentNodes.last();

        if (parent)
        {
            this.statementNodes = parent.statementNodes;

            // If the node was virtual, remove it from the parent's statement list
            if (virtualType)
                this.statementNodes.pop();
        }
    }
};

Scope.prototype.previousStatementNode = function()
{
    return this.statementNodes.last() || null;
};

Scope.prototype.parentNode = function()
{
    var parent = this.parentNodes.last();

    return parent ? parent.node : null;
};
