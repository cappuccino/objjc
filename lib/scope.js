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
        "ElseIfStatement",
        "SwitchStatement",
        "ClassDeclaration",
        "ProtocolDeclaration",
        "MethodDeclaration",
        "FunctionDeclaration",
        "FunctionExpression"
    ]);


var Scope = function(parent, properties)
{
    this.vars = Object.create(null);

    if (properties)
        this.mergeWith(properties);

    this.parent = parent;

    if (parent)
        this.compiler = parent.compiler;

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

    while (self.parent)
        self = self.parent;

    return self;
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

    var parent = this.parent;

    if (parent && !localOnly)
        return parent.getVar(name, localOnly);

    return null;
};

Scope.prototype.getLocalVar = function(/* String */ name)
{
    return this.getVar(name, true);
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

Scope.prototype.pushNode = function(node, virtualType)
{
    var type = virtualType || node.type;

    if (DEBUG)
    {
        console.log(
            "-> %s, %s, %s",
            type,
            this.previousStatementNode() ? this.previousStatementNode().type : "null",
            this.parentNode() ? this.parentNode().type : "null"
        );
    }

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
