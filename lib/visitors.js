/*
 * visitors.js
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

/* global CFURL, FileDependency */

var acorn = require("objj-acorn"),
    language = require("./language"),
    ClassDef = language.ClassDef,
    MethodDef = language.MethodDef,
    ProtocolDef = language.ProtocolDef,
    indentation = require("./indentation"),
    Scope = require("./scope"),
    StringBuffer = require("./stringbuffer"),
    util = require("util"),
    utils = require("./utils"),
    walk = require("objj-acorn/util/walk");

var reservedIdentifiers = acorn.makePredicate("self _cmd undefined localStorage arguments"),
    wordPrefixOperators = acorn.makePredicate("delete in instanceof new typeof void");

var referenceTemplate = utils.makeTemplate(
    "{\n" +
        "→if (arguments.length)\n" +
            "→→return ${data.name} = __input;\n\n" +
        "→return ${data.name};\n" +
    "}"
);

var GlobalVariableWarning = function(/* String */ message, /* SpiderMonkey AST node */ node, /* Object */ compiler)
{
    this.message = message;
    this.node = node;
};

GlobalVariableWarning.prototype.checkIfWarning = function(/* Scope */ scope)
{
    var identifier = this.node.name;

    return !scope.getLocalVar(identifier) &&
           typeof global[identifier] === "undefined" &&
           (typeof window === "undefined" || typeof window[identifier] === "undefined") &&
           !scope.compiler.getClassDef(identifier);
};

// Helper for codeGenerator.MethodDeclaration
function checkMethodOverride(compiler, node, nodeArguments, types, returnType, alreadyDeclared, selector)
{
    var declaredTypes = alreadyDeclared.types;

    if (!declaredTypes)
        return;

    if (declaredTypes.length === 0)
        return;

    // First type is return type
    var declaredReturnType = declaredTypes[0];

    // Create warning if return types are not the same.
    // It is ok if superclass has 'id' and subclass has a class type.
    if (declaredReturnType !== types[0] &&
        !(declaredReturnType === "id" && returnType && returnType.typeisclass))
    {
        compiler.addWarning(
            returnType || node.action || node.selectors[0],
            "conflicting return type in implementation of '%s': '%s' vs '%s'",
            selector,
            declaredReturnType,
            types[0]
        );

        compiler.addNote(
            alreadyDeclared.node.returntype,
            "previous implementation is here"
        );
    }

    // Check the parameter types. The count of the two type arrays
    // should be the same as they have the same selector.
    for (var i = 1; i < declaredTypes.length; i++)
    {
        var parameterType = declaredTypes[i];

        if (parameterType !== types[i] &&
            !(parameterType === "id" && nodeArguments[i - 1].type.typeisclass))
        {
            compiler.addWarning(
                nodeArguments[i - 1].type || nodeArguments[i - 1].identifier,
                "conflicting parameter type in implementation of '%s': '%s' vs '%s'",
                selector,
                parameterType,
                types[i]
            );

            compiler.addNote(alreadyDeclared.node.arguments[i - 1].type, "previous implementation is here");
        }
    }
}

exports.dependencyCollector = walk.make(  // jshint ignore:line
{
    ImportStatement: function(node, scope)
    {
        var urlString = node.filename.value;

        if (typeof FileDependency === "undefined")
            scope.compiler.dependencies.push(urlString);
        else
            scope.compiler.dependencies.push(new FileDependency(new CFURL(urlString), node.isLocal));
    }
});

exports.codeGenerator = walk.make({  // jshint ignore:line

Program: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        indentString = compiler.format.valueForProperty(scope, "*", "indent-string") || compiler.defaultOptions.indentString,
        indentWidth = compiler.format.valueForProperty(scope, "*", "indent-width") || compiler.defaultOptions.indentWidth;

    indentation.setIndent(indentString, indentWidth);

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

    // Check for conditional warnings
    scope.conditionalWarnings().forEach(function(warning)
    {
        if (warning.checkIfWarning(scope))
            compiler.addWarning(warning.message);
    });
},

BlockStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        isFunctionScope = scope.isFunctionScope;

    if (isFunctionScope)
        delete scope.isFunctionScope;

    buffer.concatWithFormats(node, scope, null, "{", "after-left-brace");

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

    if (isFunctionScope && scope.maxReceiverLevel)
    {
        buffer.concat("\n\n// Generated receiver temp variables\nvar ".indent());

        for (var i = 0; i < scope.maxReceiverLevel; i++)
        {
            if (i > 0)
                buffer.concat(", ");

            buffer.concat("__r" + (i + 1));
        }

        buffer.concat(";");
    }

    buffer.concatWithFormats(node, scope, "before-right-brace", "}");
},

ExpressionStatement: function(node, scope, compileNode)
{
    compileNode(node.expression, scope, "Expression");
},

IfStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("if", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);

    var hasBlock = node.consequent.type === "BlockStatement";

    if (!hasBlock)
        indentation.indent();

    compileNode(node.consequent, scope, "Statement");

    if (!hasBlock)
        indentation.dedent();

    var alternate = node.alternate;

    if (alternate)
    {
        var alternateNotIf = alternate.type !== "IfStatement";

        buffer.concatWithFormat(node, scope, "else");

        if (alternateNotIf)
            indentation.indent();
        else
            scope.superNodeIsElse = true;

        compileNode(alternate, scope, "Statement");

        if (alternateNotIf)
            indentation.dedent();
    }
},

LabeledStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compileNode(node.label, scope, "IdentifierName");
    buffer.concatWithFormat(node, scope, ":", "colon");
    compileNode(node.body, scope, "Statement");
},

BreakStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        label = node.label,
        buffer = compiler.jsBuffer;

    if (label)
    {
        buffer.concatWithFormats(node, scope, null, "break", "before-label", true);
        compileNode(label, scope, "IdentifierName");
    }
    else
        buffer.concat("break", node);
},

ContinueStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        label = node.label,
        buffer = compiler.jsBuffer;

    if (label)
    {
        buffer.concatWithFormats(node, scope, null, "continue", "before-label", true);
        compileNode(label, scope, "IdentifierName");
    }
    else
        buffer.concat("continue", node);
},

WithStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("with", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.object);
    indentation.indent();
    compileNode(node.body, scope, "Statement");
    indentation.dedent();
},

SwitchStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("switch", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.discriminant);
    buffer.concatWithFormat(node, scope, "{", "left-brace");

    indentation.indent();

    for (var i = 0; i < node.cases.length; i++)
    {
        var cs = node.cases[i];

        if (cs.test)
        {
            buffer.concatWithFormat(node, scope, "case", "", true);
            compileNode(cs.test, scope, "Expression");
            buffer.concatWithFormats(node, scope, null, ":", "after-colon");
        }
        else
        {
            buffer.concatWithFormat(node, scope, "default", "case");
            buffer.concatWithFormats(node, scope, null, ":", "after-colon");
        }

        indentation.indent();

        for (var j = 0; j < cs.consequent.length; j++)
            compileNode(cs.consequent[j], scope, "Statement");

        indentation.dedent();
    }

    indentation.dedent();
    buffer.concatWithFormat(node, scope, "}", "left-brace");
},

ReturnStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("return", node);

    if (node.argument)
    {
        buffer.concatFormat(node, scope, "before-expression");
        compileNode(node.argument, scope, "Expression");
    }
},

ThrowStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("throw", node);
    buffer.concatFormat(node, scope, "before-expression");

    compileNode(node.argument, scope, "Expression");
},

TryStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("try", node);

    indentation.indent();
    compileNode(node.block, scope, "Statement");
    indentation.dedent();

    if (node.handler)
    {
        var handler = node.handler,
            inner = new Scope(scope),
            param = handler.param,
            name = param.name;

        inner.vars[name] = { type: "catch clause", node: param };

        buffer.concatWithFormats(node, scope, "before-catch", "catch");
        buffer.concatLeftParens(node, scope);
        compileNode(param, scope, "IdentifierName");
        buffer.concatRightParens(node, scope);

        indentation.indent();
        inner.skipIndentation = true;
        compileNode(handler.body, inner, "ScopeBody");
        indentation.dedent();
        inner.copyIvarRefsToParent();
    }

    if (node.finalizer)
    {
        buffer.concat("finally");
        indentation.indent();
        scope.skipIndentation = true;
        compileNode(node.finalizer, scope, "Statement");
        indentation.dedent();
    }
},

WhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("while", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);

    indentation.indent();
    compileNode(body, scope, "Statement");
    indentation.dedent();
},

DoWhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("do", node);

    indentation.indent();
    compileNode(node.body, scope, "Statement");
    indentation.dedent();

    buffer.concat("while", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
},

ForStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);
    buffer.concatLeftParens(node, scope);

    if (node.init)
        compileNode(node.init, scope, "ForInit");

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.test)
        compileNode(node.test, scope, "Expression");

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.update)
        compileNode(node.update, scope, "Expression");

    buffer.concatRightParens(node, scope);

    indentation.indent();
    compileNode(body, scope, "Statement", true);
    indentation.dedent();
},

ForInStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);

    buffer.concatLeftParens(node, scope);
    compileNode(node.left, scope, "ForInit");

    buffer.concatWithFormat(node, scope, "in");
    compileNode(node.right, scope, "Expression");
    buffer.concatRightParens(node, scope);

    indentation.indent();
    compileNode(body, scope, "Statement");
    indentation.dedent();
},

ForInit: function(node, scope, compileNode)
{
    if (node.type === "VariableDeclaration")
    {
        scope.isFor = true;
        compileNode(node, scope);
        delete scope.isFor;
    }
    else
      compileNode(node, scope, "Expression");
},

DebuggerStatement: function(node, scope)
{
    scope.compiler.jsBuffer.concat("debugger", node);
},

Function: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        inner = new Scope(scope),
        decl = node.type === "FunctionDeclaration",
        id = node.id;

    inner.isDecl = decl;

    for (var i = 0; i < node.params.length; i++)
        inner.vars[node.params[i].name] = { type: "argument", node: node.params[i] };

    if (id)
    {
        var name = id.name;
        (decl ? scope : inner).vars[name] = { type: decl ? "function" : "function name", node: id };

        if (compiler.transformNamedFunctionToAssignment)
        {
            buffer.concat(name);
            buffer.concatWithFormat(node, scope, "=", "assign");
        }
    }

    buffer.concat("function", node);

    if (!compiler.transformNamedFunctionToAssignment && id)
    {
        buffer.concat(" ");
        compileNode(id, scope, "IdentifierName");
    }

    buffer.concatLeftParens(node, scope);

    for (var i = 0; i < node.params.length; i++)
    {
        if (i)
            buffer.concatComma(node, scope);

        compileNode(node.params[i], scope, "IdentifierName");
    }

    buffer.concatRightParens(node, scope);

    indentation.indent();
    compileNode(node.body, inner, "ScopeBody");
    indentation.dedent();
    inner.copyIvarRefsToParent();
},

VariableDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        decl,
        identifier;

    buffer.concatWithFormats(node, scope, "before", "var ", null, true);

    for (var i = 0; i < node.declarations.length; i++)
    {
        decl = node.declarations[i];
        identifier = decl.id.name;

        if (i > 0)
            buffer.concatComma(node, scope);

        scope.vars[identifier] = { type: "var", node: decl.id };
        compileNode(decl.id, scope, "IdentifierName");

        if (decl.init)
        {
            buffer.concatWithFormat(node, scope, "=", "assign");
            compileNode(decl.init, scope, "Expression");
        }

        // Here we check back if an ivar with the same name exists
        // and if we have prefixed 'self.' on previous uses.
        // If this is the case we have to remove the prefixes and
        // issue a warning that the variable hides the ivar.
        if (scope.ivarRefs)
            compiler.checkForShadowedIvar(scope, identifier);
    }
},

ThisExpression: function(node, scope)
{
    scope.compiler.jsBuffer.concat("this", node);
},

ArrayExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, "[", "left-bracket", true);

    for (var i = 0; i < node.elements.length; i++)
    {
        var element = node.elements[i];

        if (i !== 0)
            buffer.concatComma(node, scope);

        if (element)
            compileNode(element, scope, "Expression");
    }

    buffer.concatWithFormat(node, scope, "]", "right-bracket");
},

ObjectExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        properties = node.properties,
        buffer = compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, "{", "left-brace", true);

    for (var i = 0; i < properties.length; i++)
    {
        var property = properties[i];

        if (i)
            buffer.concatComma(node, scope);

        scope.isPropertyKey = true;
        compileNode(property.key, scope, "Expression");
        delete scope.isPropertyKey;

        buffer.concatWithFormat(node, scope, ":", "colon");
        compileNode(property.value, scope, "Expression");
    }

    buffer.concatWithFormat(node, scope, "}", "right-brace");
},

SequenceExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatLeftParens(node, scope);

    for (var i = 0; i < node.expressions.length; i++)
    {
        if (i !== 0)
            buffer.concatComma(node, scope);

        compileNode(node.expressions[i], scope, "Expression");
    }

    buffer.concatRightParens(node, scope);
},

UnaryExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        argument = node.argument,
        buffer = compiler.jsBuffer;

    if (node.prefix)
    {
        buffer.concat(node.operator, node);

        if (wordPrefixOperators(node.operator))
            buffer.concat(" ");

        compiler.concatPrecedenceExpression(node, argument, scope, compileNode);
    }
    else
    {
        compiler.concatPrecedenceExpression(node, argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

UpdateExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.argument.type === "Dereference")
    {
        // Output the dereference function, "(...)(z)"
        if (!node.prefix)
            buffer.concatLeftParens(node, scope);

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument.expr, scope, "Expression");
        buffer.concatRightParens(node, scope);

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument, scope, "Expression");
        buffer.concatOperator(node, scope, node.operator.charAt(0));
        buffer.concat("1");
        buffer.concatRightParens(node, scope);

        if (!node.prefix)
        {
            buffer.concatOperator(node, scope, node.operator === "++" ? "-" : "+");
            buffer.concat("1");
            buffer.concatRightParens(node, scope);
        }

        return;
    }

    if (node.prefix)
    {
        buffer.concat(node.operator, node);

        if (wordPrefixOperators(node.operator))
            buffer.concat(" ");

        compiler.concatPrecedenceExpression(node, node.argument, scope, compileNode);
    }
    else
    {
        compiler.concatPrecedenceExpression(node, node.argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

BinaryExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.left, scope, compileNode);
    buffer.concatOperator(node, scope);
    compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
},

LogicalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.left, scope, compileNode);
    buffer.concatOperator(node, scope);
    compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
},

AssignmentExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.left.type === "Dereference")
    {
        // Output the dereference function, "(...)(z)"
        compiler.concatParenthesizedExpression(node, scope, compileNode, node.left.expr);
        buffer.concatLeftParens(node, scope);

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator === "=")
            compiler.checkCanDereference(scope, node.left);
        else
        {
            compileNode(node.left, scope, "Expression");
            buffer.concatOperator(node, scope, node.operator.charAt(0));
        }

        compileNode(node.right, scope, "Expression");
        buffer.concatRightParens(node, scope);
    }
    else
    {
        var saveAssignment = scope.assignment,
            nodeLeft = node.left;

        scope.assignment = true;

        if (nodeLeft.type === "Identifier" && nodeLeft.name === "self")
        {
            var localVar = scope.getLocalVar("self", true);

            if (localVar)
            {
                var localVarScope = localVar.scope;

                if (localVarScope)
                    localVarScope.assignmentToSelf = true;
            }
        }

        compiler.concatPrecedenceExpression(node, node.left, scope, compileNode);
        buffer.concatOperator(node, scope);
        scope.assignment = saveAssignment;
        compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);

        if (scope.isRootScope() && node.left.type === "Identifier" && !scope.getLocalVar(node.left.name))
            scope.vars[node.left.name] = { type: "global", node: node.left };
    }
},

ConditionalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.test, scope, compileNode);
    buffer.concatOperator(node, scope, "?");
    compileNode(node.consequent, scope, "Expression");
    buffer.concatOperator(node, scope, ":");
    compileNode(node.alternate, scope, "Expression");
},

NewExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer,
        args;

    buffer.concat("new ", node);
    compiler.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    if (nodeArguments && nodeArguments.length)
    {
        args = function()
        {
            for (var i = 0; i < nodeArguments.length; i++)
            {
                if (i > 0)
                    buffer.concatComma(node, scope);

                compileNode(nodeArguments[i], scope, "Expression");
            }
        };
    }
    else
        args = null;

    buffer.concatParenthesizedBlock(node, scope, args);
},

CallExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer,
        func;

    // If call to function 'eval' we assume that 'self' can be altered and from this point
    // we check if 'self' is null before 'objj_msgSend' is called with 'self' as receiver.
    if (node.callee.type === "Identifier" && node.callee.name === "eval")
    {
        var self = scope.getLocalVar("self", true);

        if (self)
        {
            var selfScope = self.scope;

            if (selfScope)
                selfScope.assignmentToSelf = true;
        }
    }

    compiler.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    if (nodeArguments && nodeArguments.length > 0)
    {
        func = function()
        {
            for (var i = 0; i < nodeArguments.length; i++)
            {
                if (i > 0)
                    buffer.concatComma(node, scope);

                compileNode(nodeArguments[i], scope, "Expression");
            }
        };
    }
    else
        func = null;

    buffer.concatParenthesizedBlock(node, scope, func);
},

MemberExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        computed = node.computed;

    compiler.concatPrecedenceExpression(node, node.object, scope, compileNode);

    if (computed)
        buffer.concatWithFormat(node, scope, "[", "left-bracket", node);
    else
        buffer.concat(".", node);

    scope.secondMemberExpression = !computed;

    // No parentheses when it is computed, '[' amd ']' are the same thing.
    if (!computed && compiler.subnodeHasPrecedence(node, node.property))
        compiler.concatParenthesizedExpression(node, scope, compileNode);
    else
        compileNode(node.property, scope, "Expression");

    scope.secondMemberExpression = false;

    if (computed)
      buffer.concatWithFormat(node, scope, "]", "right-bracket");
},

Identifier: function(node, scope)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        identifier = node.name;

    if (scope.currentMethodType() === "-" && !scope.secondMemberExpression && !scope.isPropertyKey)
    {
        var localVar = scope.getLocalVar(identifier, true), // true === only look inside method
            ivar = compiler.getIvarForClass(identifier, scope);

        if (ivar)
        {
            if (localVar)
                compiler.addWarning(node, "local declaration of '%s' hides instance variable", identifier);
            else
            {
                // Save the index of where the "self." string is stored and the node.
                // These will be used if we find a variable declaration that is hoisting this identifier.
                if (!scope.ivarRefs)
                    scope.ivarRefs = Object.create(null);

                if (!(identifier in scope.ivarRefs))
                    scope.ivarRefs[identifier] = [];

                scope.ivarRefs[identifier].push({ node: node, index: buffer.length });
                buffer.concat("self.", node);
            }
        }
        // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
        else if (!reservedIdentifiers(identifier))
        {
            var message,
                classOrGlobal = identifier in global || (typeof window !== "undefined" && identifier in window) || compiler.getClassDef(identifier),
                globalVar = scope.getLocalVar(identifier);

            // It can't be declared with a @class statement
            if (classOrGlobal && (!globalVar || globalVar.type !== "class"))
            {
                if (localVar)
                {
                    message = new GlobalVariableWarning(util.format("Local declaration of '%s' hides global variable", identifier), node, compiler);
                }
            }
            else if (!globalVar)
            {
                if (scope.assignment)
                {
                    message = new GlobalVariableWarning(util.format("Creating global variable inside function or method '%s'", identifier), node, compiler);
                    // Turn off these warnings for this identifier, we only want one.
                    scope.vars[identifier] = { type: "remove global warning", node: node };
                }
                else
                {
                    message = new GlobalVariableWarning(util.format("Using unknown class or uninitialized global variable '%s'", identifier), node, compiler);
                }
            }

            if (message)
                scope.addConditionalWarning(message);
        }
    }

    buffer.concat(identifier, node);
},

// Use this when there should not be a look up to issue warnings or add 'self.' before ivars
IdentifierName: function(node, scope)
{
    scope.compiler.jsBuffer.concat(node.name, node);
},

Literal: function(node, scope)
{
    var buffer = scope.compiler.jsBuffer;

    if (node.raw && node.raw.charAt(0) === "@")
        buffer.concat(node.raw.substring(1), node);
    else
        buffer.concat(node.raw, node);
},

ArrayLiteral: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatFormat(node, scope, "before", "Statement");
    buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), ", true);

    if (node.elements.length)
        buffer.concat("\"initWithObjects:count:\", [", node);
    else
        buffer.concat("\"init\")", node);

    if (node.elements.length)
    {
        for (var i = 0; i < node.elements.length; i++)
        {
            var element = node.elements[i];

            if (i > 0)
                buffer.concat(", ");

            compileNode(element, scope, "Expression");
        }

        buffer.concat("], " + node.elements.length + ")");
    }
},

DictionaryLiteral: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.keys.length)
    {
        buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"initWithObjectsAndKeys:\"", node);

        for (var i = 0; i < node.keys.length; i++)
        {
            var key = node.keys[i],
                value = node.values[i];

            buffer.concat(", ");
            compileNode(value, scope, "Expression");
            buffer.concat(", ");
            compileNode(key, scope, "Expression");
        }

        buffer.concat(")");
    }
    else
    {
        buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"init\")", node);
    }
},

ImportStatement: function(node, scope)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        isLocal = node.isLocal;

    buffer.concat(util.format("objj_executeFile(\"%s\", %s)", node.filename.value, isLocal ? "YES" : "NO"), node);
},

ClassDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        className = node.classname.name,
        classScope = new Scope(scope);

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.sourcePath);
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.sourcePath);

    var result = compiler.declareClass(node),
        classDef = result.classDef,
        comment = result.comment,
        protocols = node.protocols;

    if (protocols)
    {
        for (var i = 0; i < protocols.length; i++)
            buffer.concat(
                ClassDef.protocolTemplate({
                    var: i === 0 ? "var " : "",
                    name: protocols[i].name
                }).indent(),
                protocols[i]
            );
    }

    classScope.classDef = classDef;
    compiler.currentSuperClass = util.format("objj_getClass(\"%s\").super_class", className);
    compiler.currentSuperMetaClass = util.format("objj_getMetaClass(\"%s\").super_class", className);

    // We must make a new class object for our class definition if it isn't a category
    if (!node.categoryname)
        buffer.concat("objj_registerClassPair($the_class);");

    var haveAccessors = false;

    // Now we add all ivars
    if (node.ivardeclarations && node.ivardeclarations.length > 0)
        haveAccessors = compiler.addIvars(node, compileNode, scope, classDef, classScope);

    // We will store the classDef first after accessors are done so we don't get a duplicate class error
    compiler.classDefs[className] = classDef;

    var bodyNodes = node.body;

    // Add methods and other statements
    for (var i = 0; i < bodyNodes.length; i++)
        compileNode(bodyNodes[i], classScope, "Statement");

    // Add instance methods
    var haveMethods = !compiler.imBuffer.isEmpty() || haveAccessors;

    if (haveMethods)
        buffer.concat("\n\n// Instance methods\nclass_addMethods($the_class,\n[".indent());

    if (!compiler.imBuffer.isEmpty())
        buffer.concatBuffer(compiler.imBuffer);

    if (haveAccessors)
        compiler.generateAccessors(node, classDef);

    if (haveMethods)
        buffer.concat("\n]);".indent());

    // Add class methods
    if (!compiler.cmBuffer.isEmpty())
    {
        buffer.concat("\n\n// Class methods\nclass_addMethods($the_class.isa,\n[".indent());
        buffer.concatBuffer(compiler.cmBuffer);
        buffer.concat("\n]);".indent());
    }

    buffer.concat("\n// @end: " + comment);

    // If the class conforms to protocols check self all required methods are implemented
    if (protocols)
        compiler.checkProtocolConformance(node, classDef, protocols);
},

ProtocolDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        protocolName = node.protocolname.name,
        protocolDef = compiler.getProtocolDef(protocolName),
        protocols = node.protocols,
        protocolScope = new Scope(scope),
        inheritedProtocols = [];

    if (protocolDef)
        throw compiler.syntaxError("Duplicate protocol: " + protocolName, node.protocolname);

    compiler.imBuffer = new StringBuffer();
    compiler.cmBuffer = new StringBuffer();

    var inheritedProtocolDeclarations = [],
        inheritedProtocolList;

    if (protocols)
    {
        inheritedProtocolList = [];

        for (var i = 0; i < protocols.length; i++)
        {
            var protocol = protocols[i],
                inheritedProtocolName = protocol.name,
                inheritedProtocolDef = compiler.getProtocolDef(inheritedProtocolName);

            if (!inheritedProtocolDef)
                throw compiler.syntaxError(util.format("Undefined protocol: %s", inheritedProtocolName), protocol);

            inheritedProtocolDeclarations.push(
                ProtocolDef.inheritedDeclarationTemplate(
                {
                    var: i === 0 ? "\nvar " : "",
                    name: inheritedProtocolName
                }).indent()
            );
            inheritedProtocols.push(inheritedProtocolDef);
            inheritedProtocolList.push(inheritedProtocolName);
        }

        inheritedProtocolList = " <" + inheritedProtocolList.join(", ") + ">";
    }
    else
        inheritedProtocolList = "";

    var comment = util.format("@protocol %s%s", protocolName, inheritedProtocolList);
    buffer.concat(ProtocolDef.declarationTemplate({ comment: comment, name: protocolName }), node);

    if (inheritedProtocolDeclarations.length > 0)
        buffer.concat(inheritedProtocolDeclarations.join("\n"), node);

    protocolDef = new ProtocolDef(node, protocolName, inheritedProtocols);
    compiler.protocolDefs[protocolName] = protocolDef;
    protocolScope.protocolDef = protocolDef;

    var requiredMethods = node.required;

    if (requiredMethods && requiredMethods.length > 0)
    {
        // We only add the required methods
        for (var i = 0; i < requiredMethods.length; i++)
            compileNode(requiredMethods[i], protocolScope);
    }

    // Add instance methods
    if (!compiler.imBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions($the_protocol,\n[");
        buffer.concatBuffer(compiler.imBuffer);
        buffer.concat("\n],\ntrue, true);");
    }

    // Add class methods
    if (!compiler.cmBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions($the_protocol,\n[");
        buffer.concatBuffer(compiler.cmBuffer);
        buffer.concat("\n],\ntrue, false);");
    }

    buffer.concat("\n// @end: " + comment);
},

IvarDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.outlet)
        buffer.concat("@outlet ");

    compileNode(node.ivartype, scope, "IdentifierName");
    buffer.concat(" ");
    compileNode(node.id, scope, "IdentifierName");

    if (node.accessors)
        buffer.concat(" @accessors");
},

MethodDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new Scope(scope),
        isInstanceMethod = node.methodtype === "-",
        nodeArguments = node.arguments,
        returnType = node.returntype,
        // Return type is 'id' as default except if it is an action declared method, then it's 'void'
        noReturnType = node.action ? "void" : "id",
        types = [returnType ? returnType.name : noReturnType],
        returnTypeProtocols = returnType ? returnType.protocols : null;

    if (returnTypeProtocols)
    {
        for (var i = 0; i < returnTypeProtocols.length; i++)
        {
            var returnTypeProtocol = returnTypeProtocols[i];

            if (!compiler.getProtocolDef(returnTypeProtocol.name))
                compiler.addWarning(returnTypeProtocol, "undefined protocol: '%s'", returnTypeProtocol.name);
        }
    }

    // Temporarily swap the compiler's main buffer for the method buffer
    // so the methods can be appended to the main buffer later.
    compiler.jsBuffer = isInstanceMethod ? compiler.imBuffer : compiler.cmBuffer;

    var selector = compiler.compileMethod(node, scope, compileNode, methodScope, nodeArguments, types);

    // Restore the main buffer
    compiler.jsBuffer = saveJSBuffer;

    // Add the method to the class or protocol definition
    var def = scope.classDef,
        alreadyDeclared;

    // But first, if it is a class definition check if it is declared in the superclass or interface declaration
    if (def)
        alreadyDeclared = isInstanceMethod ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
    else
        def = scope.protocolDef;

    if (!def)
        compiler.addInternalError(node, "MethodDeclaration without Implementation or Protocol");

    // Create warnings if types do not correspond to the method declaration in the superclass or interface declarations.
    // If we don't find the method in the superclass or interface declarations above or if it is a protocol
    // declaration, try to find it in any of the conforming protocols.
    if (!alreadyDeclared)
    {
        var protocols = def.protocols;

        if (protocols)
        {
            for (var i = 0; i < protocols.length; i++)
            {
                var protocol = protocols[i];

                alreadyDeclared = isInstanceMethod ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

                if (alreadyDeclared)
                    break;
            }
        }
    }

    if (alreadyDeclared)
        checkMethodOverride(compiler, node, nodeArguments, types, returnType, alreadyDeclared, selector);

    var methodDef = new MethodDef(node, selector, types);

    if (isInstanceMethod)
        def.addInstanceMethod(methodDef);
    else
        def.addClassMethod(methodDef);
},

MessageSendExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        useTempVar = false,
        receiverIsNotSelf = false;

    if (node.superObject)
    {
        var superclass = scope.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass;
        buffer.concat(util.format("objj_msgSendSuper({ receiver: self, super_class: %s }", superclass), node);
    }
    else
    {
        // If the recevier is not an identifier or an ivar that should have 'self.' in front,
        // we need to assign it to a temporary variable.
        // If the receiver is 'self', we assume it will never be nil and remove that test.
        var isIvar = scope.currentMethodType() === "-" &&
                compiler.getIvarForClass(node.object.name, scope) &&
                !scope.getLocalVar(node.object.name, true);

        useTempVar = node.object.type !== "Identifier" || isIvar;

        if (useTempVar)
        {
            receiverIsNotSelf = true;

            if (scope.hasOwnProperty("receiverLevel"))
            {
                ++scope.receiverLevel;

                if (scope.maxReceiverLevel < scope.receiverLevel)
                    scope.maxReceiverLevel = scope.receiverLevel;
            }
            else
            {
                scope.receiverLevel = 1;
                scope.maxReceiverLevel = 1;
            }

            buffer.concat("((___r" + scope.receiverLevel + " = ");
            compileNode(node.object, scope, "Expression");
            buffer.concat("), ___r" + scope.receiverLevel + " === null ? null : ___r" + scope.receiverLevel);
        }
        else
        {
            var name = node.object.name,
                localVar = scope.getLocalVar(name);

            if (name === "self")
                receiverIsNotSelf = !localVar || !localVar.scope || localVar.scope.assignmentToSelf;
            else
                receiverIsNotSelf = !!localVar || !compiler.getClassDef(name);

            if (receiverIsNotSelf)
            {
                buffer.concat("(");
                compileNode(node.object, scope, "Expression");
                buffer.concat(" == null ? null : ");
            }

            compileNode(node.object, scope, "Expression");
        }

        buffer.concat(".isa.objj_msgSend");
    }

    var selectors = node.selectors,
        nodeArguments = node.arguments,
        firstSelector = selectors[0],
        // There is always at least one selector
        selector = firstSelector ? firstSelector.name : "",
        parameters = node.parameters;

    if (!node.superObject)
    {
        var parameterCount = nodeArguments.length;

        if (node.parameters)
            parameterCount += node.parameters.length;

        if (parameterCount < 4)
            buffer.concat(String(parameterCount));

        if (useTempVar)
            buffer.concat("(___r" + scope.receiverLevel);
        else
        {
            buffer.concat("(");
            compileNode(node.object, scope, "Expression");
        }
    }

    // Assemble the selector
    for (var i = 0; i < nodeArguments.length; i++)
    {
        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";
    }

    buffer.concat(", \"" + selector + "\"");

    for (var i = 0; i < nodeArguments.length; i++)
    {
        buffer.concat(", ");
        compileNode(nodeArguments[i], scope, "Expression");
    }

    if (parameters)
    {
        for (var i = 0; i < parameters.length; i++)
        {
            buffer.concat(", ");
            compileNode(parameters[i], scope, "Expression");
        }
    }

    if (!node.superObject)
    {
        if (receiverIsNotSelf)
            buffer.concat(")");

        if (useTempVar)
            --scope.receiverLevel;
    }

    buffer.concat(")");
},

SelectorLiteralExpression: function(node, scope)
{
    scope.compiler.jsBuffer.concat(util.format("sel_getUid(\"%s\")", node.selector), node);
},

ProtocolLiteralExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("objj_getProtocol(\"", node);
    compileNode(node.id, scope, "IdentifierName");
    buffer.concat("\")");
},

Reference: function(node, scope)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("function(__input)\n" + referenceTemplate({ name: node.element.name }).indent(), node);
},

Dereference: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.checkCanDereference(scope, node.expr);

    compileNode(node.expr, scope, "Expression");
    buffer.concat("()");
},

ClassStatement: function(node, scope)
{
    var compiler = scope.compiler,
        name = node.id.name;

    if (!compiler.getClassDef(name))
        compiler.classDefs[name] = compiler.createClass(node, name);

    scope.vars[node.id.name] = { type: "class", node: node.id };
    compiler.jsBuffer.concat("// @class " + name);
},

GlobalStatement: function(node, scope)
{
    scope.rootScope().vars[node.id.name] = { type: "global", node: node.id };
},

/*eslint-disable */

PreprocessStatement: function(node, scope)  // jshint ignore:line
{
}
});  // var codeGenerator = walk.make()
