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

var parentNodeTypes = {
    "Program": true,
    "ExpressionStatement": true,
    "ForInit": true,
    "IfStatement": true,
    "ClassDeclaration": true,
    "ProtocolDeclaration": true,
    "MethodDeclaration": true
};

var Scope = function(prev, base)
{
    this.vars = Object.create(null);

    if (base)
        for (var key in base)
            if (base.hasOwnProperty(key))
                this[key] = base[key];

    this.prev = prev;
    this.currentStatement = null;
    this.previousStatement = prev ? prev.currentStatement : null;
    this.conditionalWarningList = [];

    if (prev)
    {
        this.compiler = prev.compiler;
        this.nodes = prev.nodes.slice(0);
        this.parentNodes = prev.parentNodes.slice(0);
    }
    else
    {
        this.nodes = [];
        this.parentNodes = [];
    }
};

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

Scope.prototype.copyAddedSelfToIvarsToParent = function()
{
    if (this.prev && this.addedSelfToIvars)
    {
        for (var key in this.addedSelfToIvars)
        {
            var addedSelfToIvar = this.addedSelfToIvars[key];

            if (!this.prev.addedSelfToIvars)
                this.prev.addedSelfToIvars = Object.create(null);

            if (!(key in this.prev.addedSelfToIvars))
                this.prev.addedSelfToIvars[key] = [];

            var scopeAddedSelfToIvar = this.prev.addedSelfToIvars[key];

            // Append at end in parent scope
            scopeAddedSelfToIvar.push.apply(scopeAddedSelfToIvar, addedSelfToIvar);
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

Scope.prototype.pushNode = function(node)
{
    if (node.type in parentNodeTypes)
    {
        // If currentStatement is null, we just entered this scope
        // and the previousStatement remains the same.
        if (this.currentStatement)
            this.previousStatement = this.currentStatement;

        this.currentStatement = node;
        this.parentNodes.push(node);
    }

    this.nodes.push(node);
    //console.log("-> %s, %s, %s", node.type, this.previousNode().type, this.parentNode().type);
};

Scope.prototype.popNode = function()
{
    var lastNode = this.nodes.pop(),
        lastParent = this.parentNodes.last();

    if (lastNode && lastParent && lastNode === lastParent)
        this.parentNodes.pop();

    return lastNode || null;
};

Scope.prototype.previousNode = function()
{
    // When there is no previous statement, we are at the beginning of the Program node.
    // For formatting purposes consider Program to be the previous statement of Program.
    return this.previousStatement || this.nodes.last();
};

Scope.prototype.parentNode = function()
{
    var current = this.nodes.last();

    for (var i = this.parentNodes.length - 1; i >= 0; i--)
    {
        var parent = this.parentNodes[i];

        if (parent !== current)
            return parent;
    }

    // If we reach the bottom of the parent stack, we are at Program.
    // For formatting purposes, we consider Program to be its own parent.
    return this.parentNodes[0] || null;
};

exports.Scope = Scope;
