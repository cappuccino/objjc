/*
 * compiler.js
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

/* global CFURL, class_copyIvarList, class_copyMethodList, class_copyProtocolList, class_getSuperclass, method_getName, Executable, FileDependency, objj_getClass, protocol_copyMethodDescriptionList, protocol_getName, objj_getProtocol */

var acorn = require("objj-acorn/acorn"),
    formats = require("./formats"),
    sourceMap = require("source-map"),
    util = require("util"),
    walk = require("objj-acorn/util/walk");

require("./utils");

exports.version = "1.0.0-beta";
exports.acorn = acorn;

var reservedIdentifiers = acorn.makePredicate("self _cmd undefined localStorage arguments"),
    wordPrefixOperators = acorn.makePredicate("delete in instanceof new typeof void"),
    isLogicalOrBinaryExpression = acorn.makePredicate("LogicalExpression BinaryExpression");

// The compiler first uses acorn to generate an AST. It then walks the AST to generate either
// a list of file dependencies or JavaScript code. File dependencies generation is only used
// by the Objective-J loader and runtime.
var CompilerGenerateFileDependencies = 1,
    CompilerGenerateCode = 2;

// Options may be passed to further configure the compiler. These options are recognized:

var defaultOptions = {
    // Acorn (parser) options. For more information see objj-acorn.
    // We use a function here to create a new object every time we copy the default options.
    acornOptions: function() { return Object.create(null); },

    // If true, generates a source map for the compiled file.
    sourceMap: false,

    // What to generate.
    generateWhat: CompilerGenerateCode,

    // Pass in class definitions. New class definitions in the source file will be added to this when compiling.
    classDefs: function() { return Object.create(null); },

    // Pass in protocol definitions. New protocol definitions in the source file will be added to this when compiling.
    protocolDefs: function() { return Object.create(null); },

    // The compiler uses JSON format objects which determine how the source code is formatted.
    // Example formats are located in the formats directory.
    format: "cappuccino",

    // The string to use to indent. Defaults to a single space.
    indentString: " ",

    // How many indentStrings to use when indenting generated code.
    indentWidth: 4,

    // If true, comments are included when generating code and the acorn options
    // trackComments and trackCommentsIncludeLineBreak are set true.
    includeComments: false,

    // We support this here as the old Objective-J compiler (Not a real compiler, Preprocessor.js) transformed
    // named function declarations to assignments.
    // Example: 'function f(x) { return x }' transforms to: 'f = function(x) { return x }'
    transformNamedFunctionToAssignment: false,

    // Objective-J methods are implemented as functions. If this option is true, the functions
    // are named $<class>_<method>, where <class> is the class name, and <method> is the method name.
    // If this option is false, the function is anonymous.
    generateMethodFunctionNames: true,

    // If true, the compiler generates type information for method arguments.
    generateMethodArgumentTypeSignatures: true,

    // If true, the compiler generates type information for ivars.
    generateIvarTypeSignatures: true
};

var indentString = defaultOptions.indentString,
    indentWidth = defaultOptions.indentWidth,
    indentSize = indentWidth * indentString.length,
    indentStep = indentString.repeat(indentWidth),
    indentation = "";

var setupOptions = function(options)
{
    options = options || {};

    for (var option in defaultOptions)
    {
        if (!options.hasOwnProperty(option))
        {
            var defaultOption = defaultOptions[option];
            options[option] = typeof defaultOption === "function" ? defaultOption() : defaultOption;
        }
    }

    return options;
};

var parentNodeTypes = [
    "Program",
    "Statement",
    "ForInit"
];

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
    this.maybeWarningList = [];

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
    var root = this;

    while (root.prev)
        root = root.prev;

    return root;
};

Scope.prototype.isRootScope = function()
{
    return !this.prev;
};

Scope.prototype.currentClassName = function()
{
    var scope = this;

    while (scope && !scope.classDef)
        scope = scope.prev;

    return scope ? scope.classDef.name : null;
};

Scope.prototype.currentProtocolName = function()
{
    var scope = this;

    while (scope && !scope.protocolDef)
        scope = scope.prev;

    return scope ? scope.protocolDef.name : null;
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

Scope.prototype.getLocalVar = function (/* String */ name, stopAtMethod)
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
    var scope = this;

    while (scope && !scope.methodType)
        scope = scope.prev;

    return scope ? scope.methodType : null;
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

Scope.prototype.addMaybeWarning = function(warning)
{
    this.rootScope().maybeWarningList.push(warning);
};

Scope.prototype.maybeWarnings = function()
{
    return this.rootScope().maybeWarningList;
};

Scope.prototype.pushNode = function(node, overrideType)
{
    // console.log("-> %s, %s", node.type, overrideType);

    if (overrideType)
    {
        if (parentNodeTypes.indexOf(overrideType) >= 0)
        {
            this.previousStatement = this.currentStatement;
            this.currentStatement = node;
            this.parentNodes.push(node);
        }
    }

    this.nodes.push(node);
};

Scope.prototype.popNode = function()
{
    var lastNode = this.nodes.pop(),
        lastParent = this.parentNodes.last();

    if (lastNode && lastParent && lastNode === lastParent)
        this.parentNodes.pop();

    // console.log("<- %s, %s", (lastNode || {}).type, (lastParent || {}).type);
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
            return this.parentNodes[i];
    }

    // If we reach the bottom of the parent stack, we are at Program.
    // For formatting purposes, we consider Program to be its own parent.
    return this.parentNodes[0] || null;
};

var GlobalVariableMaybeWarning = function(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* Object */ compiler)
{
    this.message = compiler.createMessage(aMessage, node);
    this.node = node;
};

GlobalVariableMaybeWarning.prototype.checkIfWarning = function(/* Scope */ scope)
{
    var identifier = this.node.name;

    return !scope.getLocalVar(identifier) &&
           typeof global[identifier] === "undefined" &&
           (typeof window === "undefined" || typeof window[identifier] === "undefined") &&
           !scope.compiler.getClassDef(identifier);
};

var operatorPrecedence = {
    // MemberExpression
    // These two are never used, since the "computed" attribute of the MemberExpression
    // determines which one to use.
    // ".": 0, "[]": 0,

    // NewExpression
    // This is never used.
    // "new": 1,

    // All these are UnaryExpression or UpdateExpression and are never used.
    //"!": 2, "~": 2, "-": 2, "+": 2, "++": 2, "--": 2, "typeof": 2, "void": 2, "delete": 2,

    // BinaryExpression
    "*": 3, "/": 3, "%": 3,
    "+": 4, "-": 4,
    "<<": 5, ">>": 5, ">>>": 5,
    "<": 6, "<=": 6, ">": 6, ">=": 6, "in": 6, "instanceof": 6,
    "==": 7, "!=": 7, "===": 7, "!==": 7,
    "&": 8,
    "^": 9,
    "|": 10,

    // LogicalExpression
    "&&": 11,
    "||": 12

    // ConditionalExpression
    // AssignmentExpression
};

var expressionTypePrecedence = {
    MemberExpression: 0,
    CallExpression: 1,
    NewExpression: 2,
    FunctionExpression: 3,
    UnaryExpression: 4, UpdateExpression: 4,
    BinaryExpression: 5,
    LogicalExpression: 6,
    ConditionalExpression: 7,
    AssignmentExpression: 8
};

// Returns true if subnode has higher precedence than node.
// If subnode is the right subnode of a binary expression, right is true.
var subnodeHasPrecedence = function(node, subnode, right)
{
    var nodeType = node.type,
        nodePrecedence = expressionTypePrecedence[nodeType] || -1,
        subnodePrecedence = expressionTypePrecedence[subnode.type] || -1;

    if (subnodePrecedence > nodePrecedence)
        return true;

    if (nodePrecedence === subnodePrecedence && isLogicalOrBinaryExpression(nodeType))
    {
        var subnodeOperatorPrecedence = operatorPrecedence[subnode.operator],
            nodeOperatorPrecedence = operatorPrecedence[node.operator];

        return (subnodeOperatorPrecedence > nodeOperatorPrecedence ||
            (right === true && nodeOperatorPrecedence === subnodeOperatorPrecedence)
            );
    }

    return false;
};

var isIdempotentExpression = function(node)
{
    var result;

    switch (node.type)
    {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (var i = 0; i < node.elements.length; i++)
            {
                if (!isIdempotentExpression(node.elements[i]))
                    return false;
            }

            return true;

        case "DictionaryLiteral":
            for (var i = 0; i < node.keys.length; i++)
            {
                if (!isIdempotentExpression(node.keys[i]))
                    return false;

                if (!isIdempotentExpression(node.values[i]))
                    return false;
            }

            return true;

        case "ObjectExpression":
            for (var i = 0; i < node.properties.length; i++)
                if (!isIdempotentExpression(node.properties[i].value))
                    return false;

            return true;

        case "FunctionExpression":
            for (var i = 0; i < node.params.length; i++)
                if (!isIdempotentExpression(node.params[i]))
                    return false;

            return true;

        case "SequenceExpression":
            for (var i = 0; i < node.expressions.length; i++)
                if (!isIdempotentExpression(node.expressions[i]))
                    return false;

            return true;

        case "UnaryExpression":
            result = isIdempotentExpression(node.argument);
            break;

        case "BinaryExpression":
            result = isIdempotentExpression(node.left) && isIdempotentExpression(node.right);
            break;

        case "ConditionalExpression":
            result = isIdempotentExpression(node.test) && isIdempotentExpression(node.consequent) && isIdempotentExpression(node.alternate);
            break;

        case "MemberExpression":
            result = isIdempotentExpression(node.object) && (!node.computed || isIdempotentExpression(node.property));
            break;

        case "Dereference":
            result = isIdempotentExpression(node.expr);
            break;

        case "Reference":
            result = isIdempotentExpression(node.element);
            break;

        default:
            result = false;
    }

    return result;
};

var indent = function()
{
    indentation += indentStep;
};

var dedent = function()
{
    indentation = indentation.substring(indentSize);
};

var StringBuffer = function(generateSourceMap, file)
{
    var lengthFunc;

    if (generateSourceMap)
    {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringFromSourceNodes;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        lengthFunc = this.sourceNodeLength;
        this.file = file;
    }
    else
    {
        this.atoms = [];
        this.concat = this.concatString;
        this.toString = this.toStringFromStrings;
        this.isEmpty = this.isEmptyString;
        this.appendStringBuffer = this.appendStringBufferString;
        lengthFunc = this.stringLength;
    }

    Object.defineProperty(this, "length", {
        get: lengthFunc
    });
};

StringBuffer.prototype.toStringFromStrings = function()
{
    return this.atoms.join("");
};

StringBuffer.prototype.toStringFromSourceNodes = function()
{
    return this.rootNode.toStringWithSourceMap({ file: this.file });
};

StringBuffer.prototype.concatString = function(aString)
{
    this.atoms.push(aString);
};

StringBuffer.prototype.concatSourceNode = function(aString, node)
{
    if (node)
    {
        //console.log("Snippet: " + aString + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
        this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, aString));
    }
    else
        this.rootNode.add(aString);

    if (this.notEmpty)
        this.notEmpty = true;
};

StringBuffer.prototype.concatFormat = function(node, scope, key, overrideType)
{
    if (!key)
        return;

    var format = scope.compiler.format,
        type = overrideType ? overrideType : node.type,
        value = format.valueForProperty(scope, type, key) || "";

    if (!value)
        return;

    var lines = value.split("\n"),
        lineIndent = indentation;

    for (var i = 0; i < lines.length; i++)
    {
        var line = lines[i];

        if (line.charAt(0) === "|")
        {
            var numberEnd = line.indexOf("|", 1);

            if (numberEnd === -1)
                numberEnd = line.length;

            var indentAmount = parseInt(line.substring(1, numberEnd), 10);

            if (indentAmount < 0)
                lineIndent = indentation.substring(indentSize * -indentAmount);
            else
                lineIndent = indentation + indentStep.repeat(indentAmount);

            lines[i] = lineIndent + line.substring(numberEnd);
        }
        else if (i > 0 && (line || i === lines.length - 1))
        {
            // Keep the current indentation
            lines[i] = indentation + line;
        }
    }

    indentation = lineIndent;
    this.concat(lines.join("\n"));
};

StringBuffer.prototype.concatWithFormat = function(node, scope, string, format, isAnchorNode)
{
    format = format || string;

    this.concatFormat(node, scope, "before-" + format);
    this.concat(string, isAnchorNode ? node : null);
    this.concatFormat(node, scope, "after-" + format);
};

StringBuffer.prototype.concatWithFormats = function(node, scope, before, string, after, isAnchorNode)
{
    if (before)
        this.concatFormat(node, scope, before);

    this.concat(string, isAnchorNode ? node : null);

    if (after)
        this.concatFormat(node, scope, after);
};

StringBuffer.prototype.concatLeftParens = function(node, scope)
{
    this.concatWithFormat(node, scope, "(", "left-parens");
};

StringBuffer.prototype.concatRightParens = function(node, scope)
{
    this.concatWithFormat(node, scope, ")", "right-parens");
};

StringBuffer.prototype.concatComma = function(node, scope)
{
    this.concatWithFormat(node, scope, ",", "comma");
};

StringBuffer.prototype.concatOperator = function(node, scope, operator)
{
    this.concatWithFormat(node, scope, operator || node.operator, "operator");
};

StringBuffer.prototype.concatParenthesizedBlock = function(node, scope, func)
{
    this.concatWithFormats(node, scope, "before-left-parens", "(", func ? "after-left-parens" : null);

    if (func)
        func();

    this.concatWithFormats(node, scope, func ? "before-left-parens" : null, ")", "after-left-parens");
};

StringBuffer.prototype.concatParenthesizedExpression = function(node, scope, compileNode, nodeToCompile)
{
    this.concatLeftParens(node, scope);
    compileNode(nodeToCompile || node, scope, "Expression");
    this.concatRightParens(node, scope);
};

StringBuffer.prototype.concatPrecedenceExpression = function(node, subnode, scope, compileNode, right)
{
    if (subnodeHasPrecedence(node, subnode, right))
        this.concatParenthesizedExpression(subnode, scope, compileNode);
    else
        compileNode(subnode, scope, "Expression");
};

StringBuffer.prototype.concatBuffer = function(buffer)
{
    this.atoms.push.apply(this.atoms, buffer.atoms);
};

StringBuffer.prototype.isEmptyString = function()
{
    return this.atoms.length !== 0;
};

StringBuffer.prototype.isEmptySourceNode = function()
{
    return !this.notEmpty;
};

StringBuffer.prototype.appendStringBufferString = function(stringBuffer)
{
    this.atoms.push.apply(this.atoms, stringBuffer.atoms);
};

StringBuffer.prototype.appendStringBufferSourceNode = function(stringBuffer)
{
    this.rootNode.add(stringBuffer.rootNode);
};

StringBuffer.prototype.stringLength = function()
{
    return this.atoms.length;
};

StringBuffer.prototype.sourceNodeLength = function()
{
    return this.rootNode.children.length;
};

/*
    Both ClassDef and ProtocolDef conform to a 'protocol' (that we can't declare in Javascript).
    Both have the attribute 'protocols': Array of ProtocolDef that they conform to.
    Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
    classDef = {
        "className": aClassName,
        "superClass": superClass ,
        "ivars": myIvars,
        "instanceMethods": instanceMethodDefs,
        "classMethods": classMethodDefs,
        "protocols": myProtocols
    };
*/
var ClassDef = function(isImplementationDeclaration, name, superClass, ivars, instanceMethods, classMethods, protocols)
{
    this.name = name;

    if (superClass)
        this.superClass = superClass;

    if (ivars)
        this.ivars = ivars;

    if (isImplementationDeclaration)
    {
        this.instanceMethods = instanceMethods || Object.create(null);
        this.classMethods = classMethods || Object.create(null);
    }

    if (protocols)
        this.protocols = protocols;
};

ClassDef.prototype.addInstanceMethod = function(methodDef) {
    this.instanceMethods[methodDef.name] = methodDef;
};

ClassDef.prototype.addClassMethod = function(methodDef) {
    this.classMethods[methodDef.name] = methodDef;
};

ClassDef.prototype.unimplementedMethodsForProtocols = function(protocolDefs)
{
    var results = [];

    for (var i = 0; i < protocolDefs.length; i++)
    {
        var protocolDef = protocolDefs[i],
            methodSources = [
                {
                    required: protocolDef.requiredInstanceMethods,
                    implemented: protocolDef.instanceMethods
                },
                {
                    required: protocolDef.requiredClassMethods,
                    implemented: protocolDef.classMethods
                }
            ];

        for (var j = 0; j < methodSources.length; j++)
        {
            var requiredMethods = methodSources[j].required;

            if (requiredMethods)
            {
                var implementedMethods = this.getMethods(methodSources[j].implemented);

                for (var methodName in requiredMethods)
                {
                    if (!(methodName in implementedMethods))
                        results.push({
                            "methodDef": requiredMethods[methodName],
                            "protocolDef": protocolDef
                        });
                }
            }
        }

        if (protocolDef.protocols)
            results = results.concat(this.unimplementedMethodsForProtocols(protocolDef.protocols));
    }

    return results;
};

ClassDef.prototype.getMethod = function(name, methods)
{
    if (methods)
    {
        var method = methods[name];

        if (method)
            return method;
    }

    if (this.superClass)
        return this.superClass.getMethod(name, methods);

    return null;
};

ClassDef.prototype.getInstanceMethod = function(name)
{
    return this.getMethod(name, this.instanceMethods);
};

ClassDef.prototype.getClassMethod = function(name)
{
    return this.getMethod(name, this.classMethods);
};

ClassDef.prototype.getMethods = function(methods)
{
    if (methods)
    {
        var superClass = this.superClass,
            returnObject = Object.create(null),
            methodName;

        if (superClass)
        {
            var superClassMethods = superClass.getMethods(methods);

            for (methodName in superClassMethods)
                returnObject[methodName] = superClassMethods[methodName];
        }

        for (methodName in methods)
            returnObject[methodName] = methods[methodName];

        return returnObject;
    }

    return [];
};

// Return a new Array with all instance methods, including inherited
ClassDef.prototype.getInstanceMethods = function()
{
    return this.getMethods(this.instanceMethods);
};

// Return a new Array with all class methods, including inherited
ClassDef.prototype.getClassMethods = function()
{
    return this.getMethods(this.classMethods);
};

/*
    protocolDef = {
        "name": aProtocolName,
        "protocols": inheritFromProtocols,
        "requiredInstanceMethods": requiredInstanceMethodDefs,
        "requiredClassMethods": requiredClassMethodDefs
    };
*/
var ProtocolDef = function(name, protocols, requiredInstanceMethodDefs, requiredClassMethodDefs)
{
    this.name = name;
    this.protocols = protocols;

    if (requiredInstanceMethodDefs)
        this.requiredInstanceMethods = requiredInstanceMethodDefs;

    if (requiredClassMethodDefs)
        this.requiredClassMethods = requiredClassMethodDefs;
};

ProtocolDef.prototype.addInstanceMethod = function(methodDef)
{
    if (!this.requiredInstanceMethods)
        this.requiredInstanceMethods = Object.create(null);

    this.requiredInstanceMethods[methodDef.name] = methodDef;
};

ProtocolDef.prototype.addClassMethod = function(methodDef)
{
    if (!this.requiredClassMethods)
        this.requiredClassMethods = Object.create(null);

    this.requiredClassMethods[methodDef.name] = methodDef;
};

ProtocolDef.prototype.getMethod = function(name, methods)
{
    var method;

    if (methods)
    {
        method = methods[name];

        if (method)
            return method;
    }

    var protocols = this.protocols;

    for (var i = 0, count = protocols.length; i < count; i++)
    {
        method = protocols[i].getMethod(name, methods);

        if (method)
            return method;
    }

    return null;
};

ProtocolDef.prototype.getInstanceMethod = function(name)
{
    return this.getMethod(name, this.requiredInstanceMethods);
};

ProtocolDef.prototype.getClassMethod = function(name)
{
    return this.getMethod(name, this.requiredClassMethods);
};

var MethodDef = function(name, types)
{
    this.name = name;
    this.types = types;
};

var Compiler = function(/* String */ source, /* String | CFURL */ url, options)
{
    this.source = source;
    this.URL = typeof CFURL === "undefined" ? url : new CFURL(url);
    options = setupOptions(options);
    this.options = options;
    this.generateWhat = options.generateWhat;
    this.classDefs = options.classDefs;
    this.protocolDefs = options.protocolDefs;
    this.createSourceMap = options.sourceMap;
    this.format = typeof options.format === "string" ? formats.load(options.format) : options.format;
    this.includeComments = options.includeComments;
    this.transformNamedFunctionToAssignment = options.transformNamedFunctionToAssignment;
    this.jsBuffer = new StringBuffer(this.createSourceMap, url);
    this.imBuffer = null;
    this.cmBuffer = null;
    this.dependencies = [];
    this.warnings = [];
    this.lastPos = 0;

    var acornOptions = options.acornOptions;

    if (!acornOptions.sourceFile)
        acornOptions.sourceFile = this.URL;

    if (options.sourceMap && !acornOptions.locations)
        acornOptions.locations = true;

    // We never want (line:column) in the error messages
    acornOptions.lineNoInErrorMessage = false;

    try
    {
        this.AST = acorn.parse(this.source, options.acornOptions);
    }
    catch (e)
    {
        if (e.lineStart)
        {
            var message = this.prettifyMessage(e, "ERROR");
            console.log(message);
        }

        throw e;
    }

    var generator;

    if (this.generateWhat === CompilerGenerateCode)
        generator = codeGenerator;
    else
        generator = dependencyCollector;

    compileWithFormat(this.AST, new Scope(null, { compiler: this }), generator, "Program");

    if (this.createSourceMap)
    {
        var s = this.jsBuffer.toString();
        this.compiledCode = s.code;
        this.sourceMap = s.map;
    }
    else
        this.compiledCode = this.jsBuffer.toString();
};

Compiler.importStack = [];

Compiler.prototype.compileParenthesizedExpression = function(node, scope, compileNode)
{
    var buffer = this.jsBuffer;

    if (compileNode)
    {
        buffer.concatLeftParens(node, scope);
        compileNode(node, scope);
        buffer.concatRightParens(node, scope);
    }
    else
    {
        buffer.concatWithFormats(node, scope, "before-left-parens", "(");
        compileNode(node, scope);
        buffer.concatWithFormats(node, scope, null, ")", "after-left-parens");
    }
};

/*
    We do not allow dereferencing of expressions with side effects because
    we might need to evaluate the expression twice in certain uses of deref,
    which is not obvious when you look at the deref operator in plain code.
*/
Compiler.prototype.checkCanDereference = function(scope, node)
{
    if (!isIdempotentExpression(node))
        throw this.syntaxError("Dereference expressions may not have side effects", node);
};

// Helper for codeGenerator.MethodDeclarationStatement
var checkMethodOverride = function(compiler, node, nodeArguments, types, returnType, alreadyDeclared, selectors, selector)
{
    var declaredTypes = alreadyDeclared.types;

    if (!declaredTypes)
        return;

    var typeCount = declaredTypes.length;

    if (typeCount === 0)
        return;

    // First type is return type
    var declaredReturnType = declaredTypes[0];

    // Create warning if return types are not the same.
    // It is ok if superclass has 'id' and subclass has a class type.
    if (declaredReturnType !== types[0] &&
        !(declaredReturnType === "id" && returnType && returnType.typeisclass))
    {
        var message = util.format("Conflicting return type in implementation of '%s': '%s' vs '%s'", selector, declaredReturnType, types[0]),
            node = returnType || node.action || selectors[0];

        compiler.addWarning(message, node);
    }

    // Check the parameter types. The count of the two type arrays
    // should be the same as they have the same selector.
    for (var i = 1; i < typeCount; i++)
    {
        var parameterType = declaredTypes[i];

        if (parameterType !== types[i] &&
            !(parameterType === "id" && nodeArguments[i - 1].type.typeisclass))
        {
            var message = util.format("Conflicting parameter types in implementation of '%s': '%s' vs '%s'", selector, + parameterType, + types[i]),
                node = nodeArguments[i - 1].type || nodeArguments[i - 1].identifier;

            compiler.addWarning(message, node);
        }
    }
};

// Helper for codeGenerator.MethodDeclarationStatement
Compiler.prototype.makeSelector = function(scope, compileNode, nodeArguments, types, selectors, selector)  // -> selector
{
    if (nodeArguments.length > 0)
    {
        for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i],
                argumentType = argument.type,
                argumentTypeName = argumentType ? argumentType.name : "id",
                argumentProtocols = argumentType ? argumentType.protocols : null,
                argumentProtocol, j, size;

            types.push(argumentTypeName);

            if (i === 0)
                selector += ":";
            else
                selector += (selectors[i] ? selectors[i].name : "") + ":";

            if (argumentProtocols)
            {
                for (j = 0, size = argumentProtocols.length; j < size; j++)
                {
                    argumentProtocol = argumentProtocols[j];

                    if (!this.getProtocolDef(argumentProtocol.name))
                        this.addWarning(util.format("Cannot find protocol declaration for '%s'", argumentProtocol.name), argumentProtocol);
                }
            }
        }
    }

    return selector;
};

Compiler.prototype.createMessage = function(/* String */ aMessage, /* SpiderMonkey AST node */ node)
{
    var message = acorn.getLineInfo(this.code, node.start);

    message.message = aMessage;

    return message;
};

Compiler.prototype.addWarning = function(/* String | Warning */ warning, node)
{
    if (typeof warning === "string")
        warning = this.createMessage(warning, node);

    this.warnings.push(warning);
};

Compiler.prototype.getIvarForClass = function(/* String */ ivarName, /* Scope */ scope)
{
    var ivar = scope.getIvarForCurrentClass(ivarName);

    if (ivar)
        return ivar;

    var classDef = this.getClassDef(scope.currentClassName());

    while (classDef)
    {
        var ivars = classDef.ivars;

        if (ivars)
        {
            var ivarDef = ivars[ivarName];

            if (ivarDef)
                return ivarDef;
        }

        classDef = classDef.superClass;
    }

    return null;
};

Compiler.prototype.getClassDef = function(/* String */ name)
{
    if (!name)
        return null;

    var classDef = this.classDefs[name] || null;

    if (classDef)
        return classDef;

    if (typeof objj_getClass === "function")
    {
        var klass = objj_getClass(name);

        if (klass)
        {
            var ivars = class_copyIvarList(klass),
                ivarCount = ivars.length,
                myIvars = Object.create(null),
                protocols = class_copyProtocolList(klass),
                protocolCount = protocols.length,
                myProtocols = Object.create(null),
                instanceMethodDefs = Compiler.methodDefsFromMethodList(class_copyMethodList(klass)),
                classMethodDefs = Compiler.methodDefsFromMethodList(class_copyMethodList(klass.isa)),
                superClass = class_getSuperclass(klass);

            for (var i = 0; i < ivarCount; i++)
            {
                var ivar = ivars[i];
                myIvars[ivar.name] = { "type": ivar.type, "name": ivar.name };
            }

            for (var i = 0; i < protocolCount; i++)
            {
                var protocolName = protocol_getName(protocols[i]);
                myProtocols[protocolName] = this.getProtocolDef(protocolName);
            }

            var superClassName = superClass ? this.getClassDef(superClass.name) : null;

            classDef = new ClassDef(true, name, superClassName,
                                    myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
            this.classDefs[name] = classDef;
        }
    }

    return classDef;
};

Compiler.prototype.getProtocolDef = function(/* String */ name)
{
    if (!name)
        return null;

    var protocolDef = this.protocolDefs[name] || null;

    if (protocolDef)
        return protocolDef;

    if (typeof objj_getProtocol === "function")
    {
        var protocol = objj_getProtocol(name);

        if (protocol)
        {
            var protocolName = protocol_getName(protocol),
                requiredInstanceMethods = protocol_copyMethodDescriptionList(protocol, true, true),
                requiredInstanceMethodDefs = Compiler.methodDefsFromMethodList(requiredInstanceMethods),
                requiredClassMethods = protocol_copyMethodDescriptionList(protocol, true, false),
                requiredClassMethodDefs = Compiler.methodDefsFromMethodList(requiredClassMethods),
                protocols = protocol.protocols,
                inheritedProtocols = [];

            if (protocols)
            {
                for (var i = 0, count = protocols.length; i < count; i++)
                    inheritedProtocols.push(this.getProtocolDef(protocols[i].name));
            }

            protocolDef = new ProtocolDef(protocolName, inheritedProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);
            this.protocolDefs[name] = protocolDef;
        }
    }

    return protocolDef;
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.checkProtocolConformance = function(node, classDef, protocols)
{
    // Lookup the protocolDefs for the protocols
    var protocolDefs = [];

    for (var i = 0, count = protocols.length; i < count; i++)
        protocolDefs.push(this.getProtocolDef(protocols[i].name));

    var unimplementedMethods = classDef.unimplementedMethodsForProtocols(protocolDefs);

    if (unimplementedMethods.length > 0)
    {
        for (var i = 0, count = unimplementedMethods.length; i < count; i++)
        {
            var unimplementedMethod = unimplementedMethods[i],
                methodDef = unimplementedMethod.methodDef,
                protocolDef = unimplementedMethod.protocolDef;

            this.addWarning(util.format("Method '%s' in protocol '%s' is not implemented", methodDef.name, protocolDef.name), node.classname);
        }
    }
};

Compiler.methodDefsFromMethodList = function(/* Array */ methodList)
{
    var count = methodList.length,
        myMethods = Object.create(null);

    for (var i = 0; i < count; i++)
    {
        var method = methodList[i],
            methodName = method_getName(method);

        myMethods[methodName] = new MethodDef(methodName, method.types);
    }

    return myMethods;
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.declareClass = function(node, classDef)  // -> classDef
{
    var buffer = this.jsBuffer,
        className = node.classname.name,
        isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
        template = (
            "{\n" +
            "^var the_class = objj_allocateClassPair(%s, \"%s\"),\n" +
            "^^meta_class = the_class.isa;\n\n"
            ).replace(/\^/g, indentStep);

    if (node.superclassname)
    {
        // To be an @implementation declaration it must have method and ivar dictionaries.
        // If there are neither, it's a @class declaration. If there is no ivar dictionary,
        // it's an @interface declaration.
        // TODO: Create a ClassDef object and add this logic to it
        if (classDef && classDef.ivars)
            // It has a real implementation declaration already
            throw this.syntaxError("Duplicate class " + className, node.classname);

        if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods)
            // It has a interface declaration already
            throw this.syntaxError("Duplicate interface definition for class " + className, node.classname);

        var superClassDef = this.getClassDef(node.superclassname.name);

        if (!superClassDef)
        {
            var errorMessage = "Can't find superclass " + node.superclassname.name;

            for (var i = Compiler.importStack.length; i >= 0; i--)
                errorMessage += util.format("\n%sImported by: %s", " ".repeat((Compiler.importStack.length - i) * 2), Compiler.importStack[i]);

            throw this.syntaxError(errorMessage, node.superclassname);
        }

        classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null));

        buffer.concat(util.format(template, node.superclassname.name, className), node);
    }
    else if (node.categoryname)
    {
        classDef = this.getClassDef(className);

        if (!classDef)
            throw this.syntaxError(util.format("Class '%s' not found", className), node.classname);

        template = (
            "{\n" +
            "^var the_class = objj_getClass(\"%s\");\n\n" +
            "^if (!the_class)\n" +
            "^^throw new SyntaxError(\"Could not find definition for class %s\");\n\n" +
            "^var meta_class = the_class.isa;\n\n"
            ).replace(/\^/g, indentStep);

        buffer.concat(util.format(template, className, className), node);
    }
    else
    {
        classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));
        buffer.concat(util.format(template, "Nil", className), node);
    }

    return classDef;
};

Compiler.prototype.getAccessorInfo = function(accessors, ivarName)
{
    var property = (accessors.property && accessors.property.name) || ivarName,
        getter = (accessors.getter && accessors.getter.name) || property;

    return { property: property, getter: getter };
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.addIvars = function(node, compileNode, scope, classDef, classScope, flags)
{
    var buffer = this.jsBuffer,
        className = node.classname.name,
        count = node.ivardeclarations.length;

    for (var i = 0; i < count; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarIdentifier = ivarDecl.id,
            ivarName = ivarIdentifier.name,
            ivars = classDef.ivars,
            ivar = { "type": ivarType, "name": ivarName },
            accessors = ivarDecl.accessors;

        if (ivars[ivarName])
            throw scope.compiler.syntaxError(util.format("Instance variable '%s' is already declared for class %s", ivarName, className), ivarIdentifier);

        if (flags.firstIvarDeclaration)
        {
            flags.firstIvarDeclaration = false;
            buffer.concat(indentStep + "class_addIvars(the_class, [\n");
        }
        else
            buffer.concat(",\n");

        buffer.concat(util.format("%snew objj_ivar(\"%s\"", indentStep.repeat(2), ivarName), node);

        if (this.options.generateIvarTypeSignatures)
            buffer.concat(util.format(", \"%s\"", ivarType));

        buffer.concat(")");

        if (ivarDecl.outlet)
            ivar.outlet = true;

        ivars[ivarName] = ivar;

        if (!classScope.ivars)
            classScope.ivars = Object.create(null);

        classScope.ivars[ivarName] = { type: "ivar", name: ivarName, node: ivarIdentifier, ivar: ivar };

        if (accessors)
        {
            var info = this.getAccessorInfo(accessors, ivarName),
                property = info.property,
                getterName = info.getter;

            classDef.addInstanceMethod(new MethodDef(getterName, [ivarType]));

            if (!accessors.readonly)
            {
                var setterName = accessors.setter ? accessors.setter.name : null;

                if (!setterName)
                {
                    if (property.charAt(0) === "_")
                        property = property.substring(1);

                    setterName = util.format("set%s:", property.capitalize());
                }

                classDef.addInstanceMethod(new MethodDef(setterName, ["void", ivarType]));
            }

            flags.hasAccessors = true;
        }
    }
};

Compiler.prototype.checkForShadowedIvar = function(scope, identifier)
{
    var addedSelfToIvar = scope.addedSelfToIvars[identifier];

    if (addedSelfToIvar)
    {
        var atoms = this.jsBuffer.atoms,
            count = addedSelfToIvar.length;

        for (var i = 0; i < count; i++)
        {
            var dict = addedSelfToIvar[i];

            atoms[dict.index] = "";
            this.addWarning(util.format("Local declaration of '%s' hides instance variable", identifier), dict.node);
        }

        scope.addedSelfToIvars[identifier] = [];
    }
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.generateGetterSetter = function(node)
{
    var getterSetterBuffer = new StringBuffer(this.createSourceMap, this.URL),
        count = node.ivardeclarations.length;

    // Add the class declaration to compile accessors correctly
    getterSetterBuffer.concat(this.source.substring(node.start, node.endOfIvars) + "\n");

    for (var i = 0; i < count; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarName = ivarDecl.id.name,
            accessors = ivarDecl.accessors;

        if (!accessors)
            continue;

        var info = this.getAccessorInfo(accessors, ivarName),
            property = info.property,
            getterName = info.getter,
            getterCode = util.format("- (%s)%s\n{\n%sreturn %s;\n}\n", (ivarType ? ivarType : "id"), getterName, indentStep, ivarName);

        getterSetterBuffer.concat(getterCode);

        if (accessors.readonly)
            continue;

        var setterName = accessors.setter ? accessors.setter.name : null;

        if (!setterName)
        {
            if (property.charAt(0) === "_")
                property = property.substring(1);

            setterName = util.format("set%s:", property);
        }

        var setterCode = util.format("- (void)%s(%s)newValue\n{%s\n", setterName, (ivarType ? ivarType : "id"), indentStep);

        if (accessors.copy)
            setterCode += util.format("if (%s !== newValue)\n%s%s = [newValue copy];\n}\n", ivarName, indentStep, ivarName);
        else
            setterCode += util.format("%s%s = newValue;\n}\n", indentStep, ivarName);

        getterSetterBuffer.concat(setterCode);
    }

    getterSetterBuffer.concat("\n@end");

    // Remove all @accessors or we will get an infinite loop
    var source = getterSetterBuffer.toString().replace(/@accessors(\(.*\))?/g, ""),
        imBuffer = exports.compileToIMBuffer(source, "Accessors", this.classDefs, this.protocolDefs, this.format);

    // Add the accessor methods first to the instance method buffer.
    // This will allow manually added set and get methods to override the compiler generated methods.
    this.imBuffer.concat(imBuffer);
};

// Helper for codeGenerator.MethodDeclarationStatement
Compiler.prototype.compileMethodBody = function(node, scope, compileNode, nodeArguments, methodScope, selector)
{
    var buffer = this.jsBuffer;

    if (node.body)
    {
        buffer.concat("function");

        if (this.options.generateMethodFunctionNames)
            buffer.concat(util.format(" $%s__%s", scope.currentClassName(), selector.replace(/:/g, "_")));

        buffer.concat("(self, _cmd");
        methodScope.methodType = node.methodtype;

        if (nodeArguments)
        {
            for (var i = 0; i < nodeArguments.length; i++)
            {
                var argument = nodeArguments[i],
                    argumentName = argument.identifier.name;

                buffer.concat(", " + argumentName);
                methodScope.vars[argumentName] = { type: "method argument", node: argument };
            }
        }

        buffer.concat(")\n");

        indent();
        compileNode(node.body, methodScope, "Statement");
        dedent();

        buffer.concat("\n");
    }
    else
        buffer.concat("Nil\n");
};

// FIXME: Does not work any more
Compiler.prototype.executable = function()
{
    if (!this._executable)
        this._executable = new Executable(this.jsBuffer ? this.jsBuffer.toString() : null,
                                          this.dependencies, this.URL, null, this);

    return this._executable;
};

Compiler.prototype.IMBuffer = function()
{
    return this.imBuffer;
};

Compiler.prototype.code = function()
{
    // Be sure to terminate with EOL
    var code = this.compiledCode;

    if (code.charAt(code.length - 1) !== "\n")
        return code + "\n";

    return code;
};

Compiler.prototype.ast = function()
{
    return JSON.stringify(this.AST, null, indentWidth);
};

Compiler.prototype.map = function()
{
    return JSON.stringify(this.sourceMap);
};

Compiler.prototype.prettifyMessage = function(/* Object */ context, /* String */ messageType)
{
    var line = this.source.substring(context.lineStart, context.lineEnd),
        message = "\n" + line;

    message += " ".repeat(context.column);
    message += "^".repeat(Math.min(1, line.length)) + "\n";
    message += messageType + " line " + context.line + " in " + this.URL + ": " + context.message;

    return message;
};

Compiler.prototype.syntaxError = function(message, node)
{
    var pos = acorn.getLineInfo(this.source, node.start),
        error = {
            message: message,
            line: pos.line,
            column: pos.column,
            lineStart: pos.lineStart,
            lineEnd: pos.lineEnd
        };

    return new SyntaxError(this.prettifyMessage(error, "ERROR"));
};

Compiler.prototype.pushImport = function(url)
{
    // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.
    Compiler.importStack.push(url);
};

Compiler.prototype.popImport = function()
{
    Compiler.importStack.pop();
};

exports.compileToExecutable = function(/* String */ source, /* CFURL | String */ url, options)
{
    Compiler.currentCompileFile = url;
    return new Compiler(source, url, options).executable();
};

exports.compileToIMBuffer = function(/* String */ source, /* CFURL | String */ url, classDefs, protocolDefs, format)
{
    var options = {
        classDefs: classDefs,
        protocolDefs: protocolDefs,
        format: format
    };

    return new Compiler(source, url, options).IMBuffer();
};

exports.compile = function(/* String */ source, /* CFURL | String */ url, options)
{
    return new Compiler(source, url, options);
};

exports.compileFileDependencies = function(/* String */ source, /* CFURL | String */ url, options)
{
    Compiler.currentCompileFile = url;

    if (!options)
        options = {};

    options.generateWhat = CompilerGenerateFileDependencies;
    return new Compiler(source, url, options).executable();
};

/*
var compile = function(node, scope, visitor)
{
    var compileNode = function(node, scope, override)
    {
        visitor[override || node.type](node, scope, compileNode);
    };

    compileNode(node, scope);
};
*/

var compileWithFormat = function(node, scope, visitor, override)  // jshint ignore:line
{
    var lastNode, lastComment;

    var compileNode = function(node, scope, override)
    {
        var compiler = scope.compiler,
            buffer = compiler.jsBuffer,
            includeComments = compiler.includeComments,
            localLastNode = lastNode,
            sameNode = localLastNode === node;

        lastNode = node;

        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment)
        {
            for (var i = 0; i < node.commentsBefore.length; i++)
                buffer.concat(node.commentsBefore[i]);
        }

        scope.pushNode(node, override);

        if (!sameNode)
            buffer.concatFormat(node, scope, "before");

        visitor[override || node.type](node, scope, compileNode);

        if (!sameNode)
            buffer.concatFormat(node, scope, "after");

        scope.popNode();

        if (includeComments && !sameNode && node.commentsAfter)
        {
            for (var i = 0; i < node.commentsAfter.length; i++)
                buffer.concat(node.commentsAfter[i]);

            lastComment = node.commentsAfter;
        }
        else
            lastComment = null;
    };

    compileNode(node, scope, override);
};

var dependencyCollector = walk.make(  // jshint ignore:line
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

var codeGenerator = walk.make({  // jshint ignore:line

Program: function(node, scope, compileNode)
{
    var compiler = scope.compiler;

    indentString = compiler.format.valueForProperty(scope, "*", "indent-string");
    indentWidth = compiler.format.valueForProperty(scope, "*", "indent-width");
    indentSize = indentWidth * indentString.length;
    indentStep = indentString.repeat(indentWidth);
    indentation = "";

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

    // Check for warnings
    scope.maybeWarnings().forEach(function(warning)
    {
        if (warning.checkIfWarning(scope))
            compiler.addWarning(warning.message);
    });
},

BlockStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatWithFormats(node, scope, null, "{", "after-left-brace");

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

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
    buffer.concatParenthesizedExpression(node, scope, compileNode, node.test);

    var hasBlock = node.consequent.type === "BlockStatement";

    if (!hasBlock)
    {
        indent();
        buffer.concat("\n" + indentation);
    }

    compileNode(node.consequent, scope, "Statement");

    if (!hasBlock)
        dedent();

    var alternate = node.alternate;

    if (alternate)
    {
        var alternateNotIf = alternate.type !== "IfStatement";

        buffer.concatWithFormat(node, scope, "else");

        if (alternateNotIf)
            indent();
        else
            scope.superNodeIsElse = true;

        compileNode(alternate, scope, "Statement");

        if (alternateNotIf)
            dedent();
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
        buffer.concatWithFormats(node, scope, null, "break", "beforeLabel", true);
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
        buffer.concatWithFormats(node, scope, null, "continue", "beforeLabel", true);
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
    buffer.concatParenthesizedExpression(node, scope, compileNode, node.object);
    indent();
    compileNode(node.body, scope, "Statement");
    dedent();
},

SwitchStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("switch", node);
    buffer.concatParenthesizedExpression(node, scope, compileNode, node.discriminant);
    buffer.concatWithFormat(node, scope, "{", "left-brace");

    indent();

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

        indent();

        for (var j = 0; j < cs.consequent.length; j++)
            compileNode(cs.consequent[j], scope, "Statement");

        dedent();
    }

    dedent();
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

    indent();
    compileNode(node.block, scope, "Statement");
    dedent();

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

        indent();
        inner.skipIndentation = true;
        compileNode(handler.body, inner, "ScopeBody");
        dedent();
        inner.copyAddedSelfToIvarsToParent();
    }

    if (node.finalizer)
    {
        buffer.concat("finally");
        indent();
        scope.skipIndentation = true;
        compileNode(node.finalizer, scope, "Statement");
        dedent();
    }
},

WhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("while", node);
    buffer.concatParenthesizedExpression(node, scope, compileNode, node.test);

    indent();
    compileNode(body, scope, "Statement");
    dedent();
},

DoWhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("do", node);

    indent();
    compileNode(node.body, scope, "Statement");
    dedent();

    buffer.concat("while", node);
    buffer.concatParenthesizedExpression(node, scope, compileNode, node.test);
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

    indent();
    compileNode(body, scope, "Statement", true);
    dedent();
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

    indent();
    compileNode(body, scope, "Statement");
    dedent();
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

    indent();
    compileNode(node.body, inner, "ScopeBody");
    dedent();
    inner.copyAddedSelfToIvarsToParent();
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
        if (scope.addedSelfToIvars)
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

    for (var i = 0, size = properties.length; i < size; i++)
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

        buffer.concatPrecedenceExpression(node, argument, scope, compileNode);
    }
    else
    {
        buffer.concatPrecedenceExpression(node, argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

UpdateExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.argument.type === "Dereference")
    {
        compiler.checkCanDereference(scope, node.argument);

        // Output the dereference function, "(...)(z)"
        if (node.prefix)
            buffer.concatLeftParens(node, scope);

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument.expr, scope, "Expression");

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument, scope, "Expression");

        buffer.concatOperator(node, scope, node.operator.charAt(0));
        buffer.concat(" 1");
        buffer.concatRightParens(node, scope);

        if (node.prefix)
        {
            buffer.concatOperator(node.operator === "++" ? "-" : "+");
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

        buffer.concatPrecedenceExpression(node, node.argument, scope, compileNode);
    }
    else
    {
        buffer.concatPrecedenceExpression(node, node.argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

BinaryExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatPrecedenceExpression(node, node.left, scope, compileNode);
    buffer.concatOperator(node, scope);
    buffer.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
},

LogicalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatPrecedenceExpression(node, node.left, scope, compileNode);
    buffer.concatOperator(node, scope);
    buffer.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
},

AssignmentExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.left.type === "Dereference")
    {
        compiler.checkCanDereference(scope, node.left);

        // Output the dereference function, "(...)(z)"
        buffer.concatParenthesizedExpression(node, scope, compileNode, node.left.expr);
        buffer.concatLeftParens(node, scope);

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator !== "=")
        {
            compileNode(node.left, scope, "Expression");
            buffer.concatOperator(node, scope, node.operator.charAt(0));
        }

        compileNode(node.right, scope, "Expression");
        buffer.concatRightParens(node, scope);
    }
    else
    {
        var saveAssignment = scope.assignment;

        scope.assignment = true;
        buffer.concatPrecedenceExpression(node, node.left, scope, compileNode);
        buffer.concatOperator(node, scope);
        scope.assignment = saveAssignment;
        buffer.concatPrecedenceExpression(node, node.right, scope, compileNode, true);

        if (scope.isRootScope() && node.left.type === "Identifier" && !scope.getLocalVar(node.left.name))
            scope.vars[node.left.name] = { type: "global", node: node.left };
    }
},

ConditionalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatPrecedenceExpression(node, node.test, scope, compileNode);
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
    buffer.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    if (nodeArguments && nodeArguments.length)
    {
        args = function()
        {
            for (var i = 0, size = nodeArguments.length; i < size; i++)
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

    buffer.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    if (nodeArguments && nodeArguments.length)
    {
        func = function()
        {
            for (var i = 0, size = nodeArguments.length; i < size; i++)
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

    buffer.concatPrecedenceExpression(node, node.object, scope, compileNode);

    if (computed)
        buffer.concatWithFormat(node, scope, "[", "left-bracket", node);
    else
        buffer.concat(".", node);

    scope.secondMemberExpression = !computed;

    // No parentheses when it is computed, '[' amd ']' are the same thing.
    if (!computed)
        buffer.concatPrecedenceExpression(node, node.property, scope, compileNode);

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
        var localVar = scope.getLocalVar(identifier, false), // Only look inside method
            ivar = compiler.getIvarForClass(identifier, scope);

        if (ivar)
        {
            if (localVar)
                compiler.addWarning(util.format("Local declaration of '%s' hides instance variable", identifier), node);
            else
            {
                // Save the index of where the "self." string is stored and the node.
                // These will be used if we find a variable declaration that is hoisting this identifier.
                if (!scope.addedSelfToIvars)
                    scope.addedSelfToIvars = Object.create(null);

                if (!(identifier in scope.addedSelfToIvars))
                    scope.addedSelfToIvars[identifier] = [];

                scope.addedSelfToIvars[identifier].push({ node: node, index: buffer.length });
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
                    message = new GlobalVariableMaybeWarning(util.format("Local declaration of '%s' hides global variable", identifier), node, compiler);
                }
            }
            else if (!globalVar)
            {
                if (scope.assignment)
                {
                    message = new GlobalVariableMaybeWarning(util.format("Creating global variable inside function or method '%s'", identifier), node, compiler);
                    // Turn off these warnings for this identifier, we only want one.
                    scope.vars[identifier] = { type: "remove global warning", node: node };
                }
                else
                {
                    message = new GlobalVariableMaybeWarning(util.format("Using unknown class or uninitialized global variable '%s'", identifier), node, compiler);
                }
            }

            if (message)
                scope.addMaybeWarning(message);
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
        buffer = compiler.jsBuffer,
        count = node.elements.length;

    buffer.concatFormat(node, scope, "before", "Statement");
    buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), ", true);

    if (count)
        buffer.concat("\"initWithObjects:count:\", [", node);
    else
        buffer.concat("\"init\")", node);

    if (count)
    {
        for (var i = 0; i < count; i++)
        {
            var element = node.elements[i];

            if (i > 0)
                buffer.concat(", ");

            compileNode(element, scope, "Expression");
        }

        buffer.concat("], " + count + ")");
    }
},

DictionaryLiteral: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        keyLength = node.keys.length;

    if (keyLength)
    {
        buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"initWithObjectsAndKeys:\"", node);

        for (var i = 0; i < keyLength; i++)
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

ClassDeclarationStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        className = node.classname.name,
        classDef = compiler.getClassDef(className),
        classScope = new Scope(scope),
        isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
        protocols = node.protocols;

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);

    // First we declare the class
    classDef = compiler.declareClass(node, classDef);

    if (protocols)
    {
        var template = (
            "\n^var the_protocol = objj_getProtocol(\"%s\");\n\n" +
            "^if (!the_protocol)\n^^throw new SyntaxError(\"Could not find definition for protocol '%s');\n\n" +
            "^class_addProtocol(the_class, the_protocol);"
            ).replace(/\^/g, indentStep);

        for (var i = 0, count = protocols.length; i < count; i++)
            buffer.concat(util.format(template, protocols[i].name), protocols[i]);
    }

    classScope.classDef = classDef;
    compiler.currentSuperClass = util.format("objj_getClass(\"%s\").super_class", className);
    compiler.currentSuperMetaClass = util.format("objj_getMetaClass(\"%s\").super_class", className);

    var flags = { firstIvarDeclaration: true, hasAccessors: false };

    // Now we add all ivars
    if (node.ivardeclarations)
        compiler.addIvars(node, compileNode, scope, classDef, classScope, flags);

    if (!flags.firstIvarDeclaration)
        buffer.concat(util.format("\n%s]);", indentStep));

    // If we have accessors add get and set methods for them
    if (!isInterfaceDeclaration && flags.hasAccessors)
        compiler.generateGetterSetter(node);

    // We will store the classDef first after accessors are done so we don't get a duplicate class error
    compiler.classDefs[className] = classDef;

    var bodies = node.body,
        bodyLength = bodies.length;

    if (bodyLength > 0)
    {
        var body;

        // And last add methods and other statements
        for (var i = 0; i < bodyLength; i++)
        {
            body = bodies[i];
            compileNode(body, classScope, "Statement");
        }
    }

    // We must make a new class object for our class definition if it's not a category
    if (!isInterfaceDeclaration && !node.categoryname)
        buffer.concat(util.format("\n\n%sobjj_registerClassPair(the_class);\n", indentStep));

    // Add instance methods
    if (compiler.imBuffer.isEmpty())
    {
        buffer.concat(util.format("\n\n%sclass_addMethods(the_class, [", indentStep));
        buffer.appendStringBuffer(compiler.imBuffer);
        buffer.concat("]);\n");
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty())
    {
        buffer.concat("class_addMethods(meta_class, [");
        buffer.appendStringBuffer(compiler.cmBuffer);
        buffer.concat("]);\n");
    }

    buffer.concat("}");

    // If the class conforms to protocols check that all required methods are implemented
    if (protocols)
        compiler.checkProtocolConformance(node, classDef, protocols);
},

ProtocolDeclarationStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        protocolName = node.protocolname.name,
        protocolDef = compiler.getProtocolDef(protocolName),
        protocols = node.protocols,
        protocolScope = new Scope(scope),
        inheritFromProtocols = [];

    if (protocolDef)
        throw compiler.syntaxError("Duplicate protocol " + protocolName, node.protocolname);

    compiler.imBuffer = new StringBuffer();
    compiler.cmBuffer = new StringBuffer();

    buffer.concat(util.format("{\n%svar the_protocol = objj_allocateProtocol(\"%s\");", indentStep, protocolName), node);

    if (protocols)
    {
        for (var i = 0, size = protocols.length; i < size; i++)
        {
            var protocol = protocols[i],
                inheritFromProtocolName = protocol.name,
                inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

            if (!inheritProtocolDef)
                throw compiler.syntaxError(util.format("Can't find protocol '%s'", inheritFromProtocolName), protocol);

            var template = (
                "\nvar inherited = objj_getProtocol(\"%s\");\n\n" +
                "if (!inherited)\n" +
                "^throw new SyntaxError(\"Could not find definition for protocol '%s'\");\n\n" +
                "protocol_addProtocol(the_protocol, inherited);"
            ).replace(/\^/g, indentStep);

            buffer.concat(util.format(template, inheritFromProtocolName, inheritFromProtocolName), node);
            inheritFromProtocols.push(inheritProtocolDef);
        }
    }

    protocolDef = new ProtocolDef(protocolName, inheritFromProtocols);
    compiler.protocolDefs[protocolName] = protocolDef;
    protocolScope.protocolDef = protocolDef;

    var someRequired = node.required;

    if (someRequired)
    {
        var requiredLength = someRequired.length;

        if (requiredLength > 0)
        {
            var required;

            // We only add the required methods
            for (var i = 0; i < requiredLength; i++)
            {
                required = someRequired[i];
                compileNode(required, protocolScope, "Statement");
            }
        }
    }

    buffer.concat("\nobjj_registerProtocol(the_protocol);\n");

    // Add instance methods
    if (compiler.imBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
        buffer.concatBuffer(compiler.imBuffer.atoms);
        buffer.concat("], true, true);\n");
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
        buffer.concatBuffer(compiler.cmBuffer.atoms);
        buffer.concat("], true, false);\n");
    }

    buffer.concat("}");
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

MethodDeclarationStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new Scope(scope),
        isInstanceMethodType = node.methodtype === "-",
        selectors = node.selectors,
        nodeArguments = node.arguments,
        returnType = node.returntype,
        // Return type is 'id' as default except if it is an action declared method, then it's 'void'
        noReturnType = node.action ? "void" : "id",
        types = [returnType ? returnType.name : noReturnType],
        returnTypeProtocols = returnType ? returnType.protocols : null,
        selector = selectors[0].name;    // There is always at least one selector

    if (returnTypeProtocols)
    {
        for (var i = 0, count = returnTypeProtocols.length; i < count; i++)
        {
            var returnTypeProtocol = returnTypeProtocols[i];

            if (!compiler.getProtocolDef(returnTypeProtocol.name))
                compiler.addWarning(util.format("Cannot find protocol declaration for '%s'", returnTypeProtocol.name), returnTypeProtocol);
        }
    }

    var buffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;
    compiler.jsBuffer = buffer;

    // Put together the selector. Maybe this should be done in the parser...
    // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
    selector = compiler.makeSelector(scope, compileNode, nodeArguments, types, selectors, selector);

    // Add comma separator if this is not first method in this buffer
    if (buffer.isEmpty())
        buffer.concat(", ");

    buffer.concat(util.format("new objj_method(sel_getUid(\"%s\"), ", selector), node);

    compiler.compileMethodBody(node, scope, compileNode, nodeArguments, methodScope, selector);

    if (compiler.options.generateMethodArgumentTypeSignatures)
        compiler.jsBuffer.concat("," + JSON.stringify(types));

    compiler.jsBuffer.concat(")");
    compiler.jsBuffer = saveJSBuffer;

    // Add the method to the class or protocol definition
    var def = scope.classDef,
        alreadyDeclared;

    // But first, if it is a class definition check if it is declared in the superclass or interface declaration
    if (def)
        alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
    else
        def = scope.protocolDef;

    if (!def)
        throw "Internal error: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: " + exports.acorn.getLineInfo(compiler.source, node.start).line;

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

                alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

                if (alreadyDeclared)
                    break;
            }
        }
    }

    if (alreadyDeclared)
        checkMethodOverride(compiler, node, nodeArguments, types, returnType, alreadyDeclared, selectors, selector);

    // Now we add it
    var methodDef = new MethodDef(selector, types);

    if (isInstanceMethodType)
        def.addInstanceMethod(methodDef);
    else
        def.addClassMethod(methodDef);
},

MessageSendExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.superObject)
    {
        var superClass = scope.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass;
        buffer.concat(util.format("objj_msgSendSuper({ receiver:self, super_class: %s }", superClass, node));
    }
    else
    {
        buffer.concat("objj_msgSend(", node);
        compileNode(node.object, scope, "Expression");
    }

    var selectors = node.selectors,
        nodeArguments = node.arguments,
        firstSelector = selectors[0],
        // There is always at least one selector
        selector = firstSelector ? firstSelector.name : "",
        parameters = node.parameters;

    // Assemble the selector. Maybe this should be done in the parser...
    for (var i = 0; i < nodeArguments.length; i++)
    {
        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";
    }

    buffer.concat(util.format(", \"%s\"", selector));

    if (nodeArguments)
    {
        for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i];

            buffer.concat(", ");
            compileNode(argument, scope, "Expression");
        }
    }

    if (parameters)
    {
        for (var i = 0; i < parameters.length; i++)
        {
            var parameter = parameters[i];

            buffer.concat(", ");
            compileNode(parameter, scope, "Expression");
        }
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
        buffer = compiler.jsBuffer,
        template = (
            "function(__input)\n" +
            "{\n" +
            "^if (arguments.length)\n" +
            "^^return %s = __input;\n\n" +
            "^return %s;\n" +
            "}"
            ).replace(/\^/g, indentStep);

    buffer.concat(util.format(template, node.element.name, node.element.name), node);
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
        className = node.id.name;

    if (!compiler.getClassDef(className))
        compiler.classDefs[className] = new ClassDef(false, className);

    scope.vars[node.id.name] = { type: "class", node: node.id };
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
