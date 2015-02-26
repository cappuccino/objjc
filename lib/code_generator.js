/*
 * code_generator.js
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

var exceptions = require("./exceptions"),
    globals = require("./globals"),
    language = require("./language"),
    indentation = require("./indentation"),
    Scope = require("./scope"),
    StringBuffer = require("./stringbuffer"),
    util = require("util"),
    utils = require("./utils"),
    walk = require("objj-acorn/util/walk");

var ClassDef = language.ClassDef,
    MethodDef = language.MethodDef,
    ProtocolDef = language.ProtocolDef,
    TypeDef = language.TypeDef;

var wordPrefixOperators = utils.arrayToHash(["delete", "in", "instanceof", "new", "typeof", "void"]);

var varTypes = {
    "global var": "a global variable",
    "@global": "a @global declaration",
    "implicit global": "an implicitly declared global",
    "@class": "a @class declaration",
    "file var": "a file variable",
    "local var": "a variable in a containing closure"
};

// Helper for codeGenerator.MethodDeclaration
function checkParameterTypes(compiler, node, nodeArguments, types, returnType, classOrProtocolDef, overriddenMethod, selector)
{
    if (overriddenMethod && compiler.shouldWarnAbout("parameter-types"))
    {
        var declaredTypes = overriddenMethod.types;

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
                overriddenMethod.node.returntype,
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

                var args = overriddenMethod.node.arguments;

                compiler.addNote(
                    args[i - 1].type,
                    "previous implementation is here"
                );
            }
        }
    }

    if (compiler.shouldWarnAbout("unknown-types"))
    {
        compiler.checkForUnknownType(returnType, returnType.name, returnType.typeisclass, classOrProtocolDef);

        for (var i = 0; i < nodeArguments.length; i++)
        {
            var type = nodeArguments[i].type;

            compiler.checkForUnknownType(type, type.name, type.typeisclass, classOrProtocolDef);
        }
    }
}

// This is only called for var declarations in non-root scopes
function checkForShadowedVars(node, scope)
{
    var compiler = scope.compiler,
        identifier = node.name,
        variable = scope.getVar(identifier),
        shadowType,
        shadowedNode;

    if (variable)
    {
        shadowType = varTypes[variable.type];

        // An implicit global here means a local var declaration
        // was made after assignment, which is legal in Javascript.
        if (variable.type === "implicit global")
        {
            variable.type = "local var";
            delete variable.implicit;
            shadowType = null;

            // When the original assignment was made, the var vas added
            // to the root scope as a global. It no longer is global.
            delete scope.rootScope().vars[identifier];
        }
        else
            shadowedNode = variable.node;
    }
    else
    {
        var classDef = compiler.getClassDef(identifier);

        if (classDef)
        {
            shadowType = "a class";
            shadowedNode = classDef.node;
        }
        else
        {
            variable = compiler.getPredefinedGlobal(identifier);

            if (variable !== undefined && (variable.ignoreShadow === undefined || variable.ignoreShadow === false))
                shadowType = "a predefined global";
        }
    }

    if (shadowType)
    {
        compiler.addWarning(
            node,
            "local declaration of '%s' shadows %s",
            identifier,
            shadowType
        );

        if (shadowedNode)
            compiler.addNote(shadowedNode, "declaration is here");
    }
}

/*
    This is only called in assignments or references in expressions, not for declared variables.
    Checks for the following conditions:

    - Assigning to a read-only predefined global
    - Implicitly creating a global var (via assignment) in a local scope
    - Referencing an unknown identifier as an rvalue
*/
function checkIdentifierReference(node, scope)
{
    var compiler = scope.compiler,
        identifier = node.name;

    if (scope.assignment)
    {
        // Assignments to properties are not checked
        if (scope.isMemberParent)
            return;

        var variable = compiler.getPredefinedGlobal(identifier);

        if (variable !== undefined && (variable === false || variable.writable === false))
        {
            compiler.addWarning(node, "assigning to a read-only predefined global");
        }
        else if (variable === undefined && !scope.getVar(identifier))
        {
            if (!compiler.isUniqueDefinition(node, scope, identifier))
                return;

            if (scope.isLocalScope())
            {
                if (compiler.shouldWarnAbout("implicit-globals"))
                {
                    var context = scope.functionName || scope.selector;

                    compiler.addIssue(
                        exceptions.ImplicitGlobalWarning,
                        node,
                        "implicitly creating a global variable in the %s '%s'; did you mean to use 'var %s'?",
                        scope.functionName ? "function" : "method",
                        context,
                        identifier
                    );
                }

                // Mark this identifier in the scope, we only want one warning.
                scope.vars[identifier] = {
                    type: "implicit global",
                    node: node,
                    implicit: true
                };
            }

            scope.rootScope().vars[identifier] = {
                type: "global var",
                node: node,
                implicit: scope.isLocalScope()
            };
        }
    }
    else if (compiler.shouldWarnAbout("unknown-identifiers"))
    {
        if (scope.getVar(identifier) === null &&
            compiler.getClassDef(identifier) === null &&
            compiler.getProtocolDef(identifier) === null &&
            compiler.getTypeDef(identifier) === null &&
            !compiler.isPredefinedGlobal(identifier))
        {
            var suggestion = "";

            // It could be a misspelled class name
            if (scope.receiver)
            {
                var classDef = compiler.findClassDef(identifier);

                if (classDef)
                    suggestion = "; did you mean '" + classDef.name + "'?";
            }

            compiler.addIssue(
                exceptions.UnknownIdentifierWarning,
                node,
                "reference to unknown identifier '%s'%s",
                identifier,
                suggestion
            );
        }
    }
}

module.exports = walk.make({  // jshint ignore:line

Program: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        indentString = compiler.format.valueForProperty(scope, "*", "indent-string"),
        indentWidth = compiler.format.valueForProperty(scope, "*", "indent-width");

    indentString = indentString || compiler.defaultOptions.indentString;
    indentWidth = indentWidth || compiler.defaultOptions.indentWidth;
    indentation.setIndent(indentString, indentWidth);

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope);

    scope.close();
    compiler.filterIdentifierIssues(scope);
},

BlockStatement: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concatWithFormats(node, scope, null, "{", "after-left-brace");

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope);

    scope.close();
    buffer.concatWithFormats(node, scope, "before-right-brace", "}");
},

ExpressionStatement: function(node, scope, compileNode)
{
    compileNode(node.expression, scope);
},

IfStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("if", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
    compiler.compileDependentStatement(node.consequent, scope, compileNode);

    if (node.alternate)
    {
        var isElseIf = node.alternate.type === "IfStatement",
            type = isElseIf ? "ElseIfStatement" : "IfStatement";

        buffer.concatWithFormat(node, scope, "else", null, true, type);

        if (isElseIf)
            compileNode(node.alternate, scope, "ElseIfStatement");
        else
        {
            scope.pushNode(node, "ElseStatement");
            compiler.compileDependentStatement(node.alternate, scope, compileNode);
            scope.popNode(node, "ElseStatement");
        }
    }
},

ElseIfStatement: function(node, scope, compileNode)
{
    compileNode(node, scope);
},

LabeledStatement: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    compileNode(node.label, scope, "IdentifierName");
    buffer.concatWithFormat(node, scope, ":", "colon");
    compileNode(node.body, scope);
},

BreakStatement: function(node, scope, compileNode)
{
    var label = node.label,
        buffer = scope.compiler.jsBuffer;

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
    var label = node.label,
        buffer = scope.compiler.jsBuffer;

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
    compiler.compileDependentStatement(node.body, scope, compileNode);
},

SwitchStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("switch", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.discriminant);
    buffer.concatWithFormat(node, scope, "{", "left-brace");

    for (var i = 0; i < node.cases.length; i++)
    {
        var cs = node.cases[i];

        if (cs.test)
        {
            buffer.concatWithFormats(node, scope, "before-case", "case ", null, true);
            compileNode(cs.test, scope);
            buffer.concatWithFormat(node, scope, ":", "colon");
        }
        else
        {
            buffer.concatWithFormats(node, scope, "before-case", "default", null, true);
            buffer.concatWithFormat(node, scope, ":", "colon");
        }

        if (cs.consequent.length > 0)
        {
            indentation.indent();

            for (var j = 0; j < cs.consequent.length; j++)
                compileNode(cs.consequent[j], scope);

            indentation.dedent();

            if (i < node.cases.length - 1)
                buffer.concatFormat(node, scope, "between-case-blocks");
        }
    }

    buffer.concatWithFormat(node, scope, "}", "right-brace");
},

ReturnStatement: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concat("return" + (node.argument ? " " : ""), node);

    if (node.argument)
        compileNode(node.argument, scope);
},

ThrowStatement: function(node, scope, compileNode)
{
    scope.compiler.jsBuffer.concat("throw ", node);
    compileNode(node.argument, scope);
},

TryStatement: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concat("try", node);
    compileNode(node.block, scope);

    if (node.handler)
    {
        var handler = node.handler,
            param = handler.param,
            name = param.name;

        // Inject the catch variable into the scope
        scope.vars[name] = { type: "local var", node: param };

        buffer.concatWithFormats(node, scope, "before-catch", "catch");
        buffer.concatLeftParens(node, scope);
        compileNode(param, scope, "IdentifierName");
        buffer.concatRightParens(node, scope);

        compileNode(handler.body, scope);

        delete scope.vars[name];
    }

    if (node.finalizer)
    {
        buffer.concatWithFormats(node, scope, "before-finally", "finally");
        compileNode(node.finalizer, scope);
    }
},

WhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("while", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);

    indentation.indent();
    compileNode(node.body, scope);
    indentation.dedent();
},

DoWhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("do", node);

    indentation.indent();
    compileNode(node.body, scope);
    indentation.dedent();

    buffer.concat("while", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
},

ForStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);
    buffer.concatLeftParens(node, scope);

    if (node.init)
        compileNode(node.init, scope, "ForInit");

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.test)
        compileNode(node.test, scope);

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.update)
        compileNode(node.update, scope);

    buffer.concatRightParens(node, scope);
    compiler.compileDependentStatement(node.body, scope, compileNode);
},

ForInit: function(node, scope, compileNode)
{
    compileNode(node, scope);
},

ForInStatement: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concat("for", node);

    buffer.concatLeftParens(node, scope);
    compileNode(node.left, scope);

    buffer.concatWithFormat(node, scope, "in");
    compileNode(node.right, scope);
    buffer.concatRightParens(node, scope);

    indentation.indent();
    compileNode(node.body, scope);
    indentation.dedent();
},

DebuggerStatement: function(node, scope)
{
    var compiler = scope.compiler;

    compiler.jsBuffer.concat("debugger", node);

    if (compiler.shouldWarnAbout("debugger"))
        compiler.addWarning(node, "debugger statement");
},

Function: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        inner = new Scope(scope),
        decl = node.type === "FunctionDeclaration",
        id = node.id;

    inner.isDecl = decl;
    inner.functionName = id ? id.name : "<anonymous>";

    for (var i = 0; i < node.params.length; i++)
        inner.vars[node.params[i].name] = { type: "argument", node: node.params[i] };

    if (id)
    {
        var name = id.name;
        (decl ? scope : inner).vars[name] = { type: decl ? "function" : "function name", node: id };

        if (compiler.options.transformNamedFunctionToAssignment)
        {
            buffer.concat(name);
            buffer.concatWithFormat(node, scope, "=", "assign");
        }
    }

    buffer.concat("function", node);

    if (!compiler.options.transformNamedFunctionToAssignment && id)
    {
        buffer.concat(" ");
        compileNode(id, scope, "IdentifierName");
    }

    buffer.concatLeftParens(node, scope);

    for (var i = 0; i < node.params.length; i++)
    {
        if (i > 0)
            buffer.concatComma(node, scope);

        compileNode(node.params[i], scope, "IdentifierName");
    }

    buffer.concatRightParens(node, scope);

    compileNode(node.body, inner);

    inner.copyIvarRefsToParent();
    compiler.filterIdentifierIssues(inner);
},

VariableDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        isLocalScope = scope.isLocalScope();

    buffer.concat("var ", node);

    for (var i = 0; i < node.declarations.length; i++)
    {
        var decl = node.declarations[i],
            identifier = decl.id.name;

        if (i > 0)
            buffer.concatComma(node, scope);

        if (identifier in globals.reserved)
            compiler.addWarning(node, "reserved word used for variable name");
        else if (scope.isLocalScope() && compiler.shouldWarnAbout("shadowed-vars"))
            checkForShadowedVars(decl.id, scope);

        scope.vars[identifier] = {
            type: isLocalScope ? "local var" : "file var",
            node: decl.id
        };

        compileNode(decl.id, scope, "IdentifierName");

        if (decl.init)
        {
            buffer.concatWithFormat(node, scope, "=", "assign");
            compileNode(decl.init, scope);
        }

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
    var buffer = scope.compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, "[", "left-bracket", true);

    for (var i = 0; i < node.elements.length; i++)
    {
        var element = node.elements[i];

        if (i !== 0)
            buffer.concatComma(node, scope);

        if (element)
            compileNode(element, scope);
    }

    buffer.concatWithFormat(node, scope, "]", "right-bracket");
},

ObjectExpression: function(node, scope, compileNode)
{
    var properties = node.properties,
        buffer = scope.compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, "{", "left-brace", true);

    for (var i = 0; i < properties.length; i++)
    {
        var property = properties[i];

        if (i)
            buffer.concatComma(node, scope);

        buffer.concatFormat(node, scope, "before-property");
        scope.isPropertyKey = true;
        compileNode(property.key, scope);
        delete scope.isPropertyKey;

        buffer.concatWithFormat(node, scope, ":", "colon");
        compileNode(property.value, scope);
    }

    buffer.concatWithFormat(node, scope, "}", "right-brace");
},

SequenceExpression: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concatLeftParens(node, scope);

    for (var i = 0; i < node.expressions.length; i++)
    {
        if (i !== 0)
            buffer.concatComma(node, scope);

        compileNode(node.expressions[i], scope);
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

        if (node.operator in wordPrefixOperators)
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
        buffer.concat("/* ");

        if (node.prefix)
            buffer.concat(node.operator + "@deref(" + node.argument.expr.name + ") */");
        else
        {
            buffer.concat("@deref(" + node.argument.expr.name + ")" + node.operator + " */");
            buffer.concatLeftParens(node, scope);
        }

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument.expr, scope);
        buffer.concatRightParens(node, scope);

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument, scope);
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

        if (node.operator in wordPrefixOperators)
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
        buffer = compiler.jsBuffer,
        target = node.left;

    if (target.type === "Dereference")
    {
        // Output the dereference function, "(...)(z)"
        compiler.concatParenthesizedExpression(node, scope, compileNode, target.expr);
        buffer.concatLeftParens(node, scope);

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator === "=")
            compiler.checkCanDereference(node);
        else
        {
            compileNode(target, scope);
            buffer.concatOperator(node, scope, node.operator.charAt(0));
        }

        compileNode(node.right, scope);
        buffer.concatRightParens(node, scope);
    }
    else
    {
        var assignment = scope.assignment;

        scope.assignment = true;

        if (target.type === "Identifier" && target.name === "self")
        {
            var localVar = scope.getLocalVar("self");

            if (localVar)
            {
                var localVarScope = localVar.scope;

                if (localVarScope)
                    localVarScope.assignmentToSelf = true;
            }
        }

        compiler.concatPrecedenceExpression(node, target, scope, compileNode);
        buffer.concatOperator(node, scope);
        scope.assignment = assignment;
        compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
    }
},

ConditionalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.test, scope, compileNode);
    buffer.concatOperator(node, scope, "?");
    compileNode(node.consequent, scope);
    buffer.concatOperator(node, scope, ":");
    compileNode(node.alternate, scope);
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

                compileNode(nodeArguments[i], scope);
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
        var selfVar = scope.getLocalVar("self");

        if (selfVar)
        {
            var selfScope = selfVar.scope;

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

                compileNode(nodeArguments[i], scope);
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

    // We need to know that the identifier is the parent of a member expression so that
    // if it is an ivar a reference will be added, but assignment checks will not be done.
    scope.isMemberParent = true;
    compiler.concatPrecedenceExpression(node, node.object, scope, compileNode);
    delete scope.isMemberParent;

    if (computed)
        buffer.concatWithFormat(node, scope, "[", "left-bracket", node);
    else
        buffer.concat(".", node);

    scope.isMemberExpression = true;

    // No parentheses when it is computed, '[' amd ']' are the same thing.
    if (!computed && compiler.subnodeHasPrecedence(node, node.property))
        compiler.concatParenthesizedExpression(node, scope, compileNode);
    else
        compileNode(node.property, scope);

    delete scope.isMemberExpression;

    if (computed)
      buffer.concatWithFormat(node, scope, "]", "right-bracket");
},

Identifier: function(node, scope)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        identifier = node.name,
        // We only check the validity of variables, not their properties
        valid = scope.isMemberExpression || scope.isPropertyKey;

    if (!valid && scope.isLocalScope())
    {
        var localVar = scope.getLocalVar(identifier);

        if (localVar)
            valid = true;
        else if (scope.currentMethodType() === "-")
        {
            if (identifier === "self")
                valid = true;
            else
            {
                // If we see a standalone identifier within an instance method,
                // we have to figure out if it's an ivar
                var ivar = compiler.getIvarForClass(identifier, scope);

                if (ivar)
                {
                    scope.addIvarRef(node, identifier, ivar);
                    valid = true;
                }
            }
        }
    }

    buffer.concat(identifier, node);

    if (!valid)
        checkIdentifierReference(node, scope);
},

// Use this when there should not be a lookup to issue warnings or add 'self.' before ivars
IdentifierName: function(node, scope)
{
    scope.compiler.jsBuffer.concat(node.name, node);
},

Literal: function(node, scope)
{
    var buffer = scope.compiler.jsBuffer;

    if (node.raw.charAt(0) === "@")
        buffer.concat(node.raw.substring(1), node);
    else
        buffer.concat(node.raw, node);
},

ArrayLiteral: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), ", node);

    if (node.elements.length)
    {
        buffer.concat("\"initWithObjects:count:\", [");

        for (var i = 0; i < node.elements.length; i++)
        {
            var element = node.elements[i];

            if (i > 0)
                buffer.concat(", ");

            compileNode(element, scope);
        }

        buffer.concat("], " + node.elements.length + ")");
    }
    else
        buffer.concat("\"init\")");
},

DictionaryLiteral: function(node, scope, compileNode)
{
    var buffer = scope.compiler.jsBuffer;

    buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), ", node);

    if (node.keys.length)
    {
        buffer.concat("\"initWithObjectsAndKeys:\"", node);

        for (var i = 0; i < node.keys.length; i++)
        {
            var key = node.keys[i],
                value = node.values[i];

            buffer.concat(", ");
            compileNode(value, scope);
            buffer.concat(", ");
            compileNode(key, scope);
        }

        buffer.concat(")");
    }
    else
    {
        buffer.concat("\"init\")", node);
    }
},

ImportStatement: function(node, scope)
{
    var buffer = scope.compiler.jsBuffer,
        isLocal = node.isLocal;

    buffer.concat(util.format("objj_executeFile(\"%s\", %s)", node.filename.value, isLocal ? "YES" : "NO"), node);
},

ClassDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        className = node.classname.name;

    if (!compiler.isUniqueDefinition(node, scope, className))
        return;

    compiler.imBuffer = new StringBuffer(compiler.options.sourceMap, compiler.sourcePath);
    compiler.cmBuffer = new StringBuffer(compiler.options.sourceMap, compiler.sourcePath);

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

    var classScope = new Scope(scope);

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
        compileNode(bodyNodes[i], classScope);

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
        protocolName = node.protocolname.name;

    if (!compiler.isUniqueDefinition(node, scope, protocolName))
        return;

    compiler.imBuffer = new StringBuffer(compiler.options.sourceMap, compiler.sourcePath);
    compiler.cmBuffer = new StringBuffer(compiler.options.sourceMap, compiler.sourcePath);

    var protocols = node.protocols,
        protocolScope = new Scope(scope),
        inheritedProtocols = [],
        inheritedProtocolDeclarations = [],
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
                throw compiler.syntaxError("Undefined protocol: " + inheritedProtocolName, protocol);

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

    var comment = "@protocol " + protocolName + inheritedProtocolList;
    buffer.concat(ProtocolDef.declarationTemplate({ comment: comment, name: protocolName }), node);

    if (inheritedProtocolDeclarations.length > 0)
        buffer.concat(inheritedProtocolDeclarations.join("\n"), node);

    var protocolDef = new ProtocolDef(node, protocolName, inheritedProtocols);
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
                compiler.addWarning(returnTypeProtocol, "cannot find protocol declaration for '%s'", returnTypeProtocol.name);
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
        duplicate = null,
        method = null;

    if (def)
    {
        if (isInstanceMethod)
            duplicate = def.getOwnInstanceMethod(selector);
        else
            duplicate = def.getOwnClassMethod(selector);

        if (duplicate)
        {
            compiler.addError(node, "duplicate definition of method '%s'", selector);
            compiler.addNote(duplicate.node, "original definition is here:");
        }
    }
    else
    {
        def = scope.protocolDef;

        if (def)
        {
            if (isInstanceMethod)
                duplicate = def.getOwnInstanceMethod(selector);
            else
                duplicate = def.getOwnClassMethod(selector);

            if (duplicate)
            {
                compiler.addWarning(node, "multiple declarations of method '%s' found and ignored", selector);
                compiler.addNote(duplicate.node, "first declaration is here:");
            }
        }
        else
        {
            compiler.addInternalError(node, "MethodDeclaration without Implementation or Protocol");
            return;
        }
    }

    if (!duplicate)
    {
        method = isInstanceMethod ? def.getInstanceMethod(selector) : def.getClassMethod(selector);

        if (!method)
        {
            var protocols = def.protocols;

            if (protocols)
            {
                for (var i = 0; i < protocols.length; i++)
                {
                    var protocol = protocols[i];

                    method = isInstanceMethod ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

                    if (method)
                        break;
                }
            }
        }

        checkParameterTypes(compiler, node, nodeArguments, types, returnType, def, method, selector);

        var methodDef = new MethodDef(node, selector, types);

        if (isInstanceMethod)
            def.addInstanceMethod(methodDef);
        else
            def.addClassMethod(methodDef);
    }

    compiler.filterIdentifierIssues(methodScope);
},

MessageSendExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        useTempVar = false,
        receiverIsNotSelf = false,
        nodeObjectString;

    if (node.superObject)
    {
        var superclass = scope.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass;
        buffer.concat("objj_msgSendSuper({ receiver: self, super_class: " + superclass + " }", node);
    }
    else
    {
        // If the receiver is not an identifier or an ivar that should have 'self.' in front,
        // we need to assign it to a temporary variable.
        // If the receiver is 'self', we assume it will never be nil and remove that test.
        var isIvar = scope.currentMethodType() === "-" &&
                compiler.getIvarForClass(node.object.name, scope) !== null &&
                !scope.getLocalVar(node.object.name);

        useTempVar = node.object.type !== "Identifier" || isIvar;

        // We cache the result of compiling node.object, otherwise it potentially
        // could be compiled 3 times.
        var nodeBuffer = new StringBuffer(compiler.options.sourceMap, compiler.sourcePath);

        // If node.object is an identifier, it's the receiver
        if (node.object.type === "Identifier")
            scope.receiver = true;

        compiler.jsBuffer = nodeBuffer;
        compileNode(node.object, scope);
        compiler.jsBuffer = buffer;

        nodeObjectString = nodeBuffer.toString();
        delete scope.receiver;

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

            buffer.concat(util.format(
                "((___r%d = %s), ___r%d === null ? null : ___r%d",
                scope.receiverLevel,
                nodeObjectString,
                scope.receiverLevel,
                scope.receiverLevel
            ));
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
                buffer.concat("(" + nodeObjectString + " == null ? null : ");

            buffer.concat(nodeObjectString);
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
            buffer.concat("(" + nodeObjectString);
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
        compileNode(nodeArguments[i], scope);
    }

    if (parameters)
    {
        for (var i = 0; i < parameters.length; i++)
        {
            buffer.concat(", ");
            compileNode(parameters[i], scope);
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
    var buffer = scope.compiler.jsBuffer,
        name = node.id.name,
        protocol = scope.compiler.getProtocolDef(name);

    if (protocol)
    {
        buffer.concat("objj_getProtocol(\"", node);
        compileNode(node.id, scope, "IdentifierName");
        buffer.concat("\")");
    }
    else
        scope.compiler.addError(node, "cannot find protocol declaration for '%s'", name);
},

Reference: function(node, scope)
{
    var buffer = scope.compiler.jsBuffer,
        name = node.element.name;

    buffer.concat(
        "/* @ref(" + name + ") */ " +
        "function $at_ref(__value) { return arguments.length ? " + name + " = __value : " + name + "; }",
        node
    );
},

Dereference: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.checkCanDereference(node.expr);
    compileNode(node.expr, scope);
    buffer.concat("()");
},

ClassStatement: function(node, scope)
{
    var compiler = scope.compiler,
        name = node.id.name;

    if (compiler.isUniqueDefinition(node, scope, name))
    {
        compiler.classDefs[name] = compiler.createClass(node, name);
        compiler.jsBuffer.concat("// @class " + name);
    }
},

GlobalStatement: function(node, scope)
{
    var compiler = scope.compiler;

    if (compiler.isUniqueDefinition(node, scope, node.id.name))
    {
        scope.rootScope().vars[node.id.name] = { type: "@global", node: node.id };
        compiler.jsBuffer.concat("// @global " + node.id.name);
    }
},

TypeDefStatement: function(node, scope)
{
    var compiler = scope.compiler,
        name = node.typedefname.name;

    if (!compiler.isUniqueDefinition(node, scope, name))
        return;

    compiler.addTypeDef(new TypeDef(name));
    compiler.jsBuffer.concat("// @typedef " + name);
},

/*eslint-disable */

PreprocessStatement: function(node, scope)  // jshint ignore:line
{
}
});  // var codeGenerator = walk.make()
