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

/* global acorn, CFURL, class_copyIvarList, class_copyMethodList, class_copyProtocolList, class_getSuperclass, method_getName, define, Executable, FileDependency, objj_getClass, protocol_copyMethodDescriptionList, protocol_getName, objj_getProtocol */

var acorn = require("objj-acorn/acorn"),
    sourceMap = require("source-map"),
    util = require("util"),
    utils = require("./utils"),
    walk = require("objj-acorn/util/walk");


//noinspection OverlyNestedFunctionJS

"use strict";

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
    format: null,

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

var createMessage = function(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code)
{
    var message = acorn.getLineInfo(code, node.start);

    message.message = aMessage;

    return message;
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
    return this.prev ? this.prev.rootScope() : this;
};

Scope.prototype.isRootScope = function()
{
    return !this.prev;
};

Scope.prototype.currentClassName = function()
{
    var prevName = this.prev ? this.prev.currentClassName() : null;

    return this.classDef ? this.classDef.name : prevName;
};

Scope.prototype.currentProtocolName = function()
{
    var prevName = this.prev ? this.prev.currentProtocolName() : null;

    return this.protocolDef ? this.protocolDef.name : prevName;
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

Scope.prototype.getLvar = function (/* String */ lvarName, stopAtMethod)
{
    if (this.vars)
    {
        var lvar = this.vars[lvarName];

        if (lvar)
            return lvar;
    }

    var prev = this.prev;

    // Stop at the method declaration
    if (prev && (!stopAtMethod || !this.methodType))
        return prev.getLvar(lvarName, stopAtMethod);

    return null;
};

Scope.prototype.currentMethodType = function()
{
    var prevName = this.prev ? this.prev.currentMethodType() : null;

    return this.methodType ? this.methodType : prevName;
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
    var rootScope = this.rootScope();

    if (!rootScope.maybeWarningList)
        rootScope.maybeWarningList = [];

    rootScope.maybeWarningList.push(warning);
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

var GlobalVariableMaybeWarning = function(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code)
{
    this.message = createMessage(aMessage, node, code);
    this.node = node;
};

GlobalVariableMaybeWarning.prototype.checkIfWarning = function(/* Scope */ scope)
{
    var identifier = this.node.name;

    return !scope.getLvar(identifier) &&
           typeof global[identifier] === "undefined" &&
           (typeof window === "undefined" || typeof window[identifier] === "undefined") &&
           !scope.compiler.getClassDef(identifier);
};

var StringBuffer = function(useSourceNode, file)
{
    if (useSourceNode)
    {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringFromSourceNodes;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        this.length = this.sourceNodeLength;
        this.file = file;
    }
    else
    {
        this.atoms = [];
        this.concat = this.concatString;
        this.toString = this.toStringFromStrings;
        this.isEmpty = this.isEmptyString;
        this.appendStringBuffer = this.appendStringBufferString;
        this.length = this.stringLength;
    }
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

StringBuffer.prototype.concatFormat = function(node, scope, key)
{
    if (!key)
        return;

    var format = scope.compiler.format,
        value = format.valueForProperty(scope, node.type, key) || "";

    if (!value)
        return;

    if (value.indexOf("\n") < 0)
    {
        this.concat(value);
        return;
    }

    var lines = value.split("\n");

    for (var i = 1; i < lines.length; i++)
    {
        var line = lines[i];

        if (line.charAt(0) === "|")
        {
            var numberEnd = line.indexOf("|", 1);

            if (numberEnd === -1)
                numberEnd = line.length;

            var indentAmount = parseInt(line.substring(1, numberEnd), 10),
                lineIndent;

            if (indentAmount === 0)
                lineIndent = "";
            else if (indentAmount < 0)
                lineIndent = indentation.substring(indentSize * -indentAmount);
            else
                lineIndent = indententation + indentStep.repeat(indentAmount);

            lines[i] = lineIndent + line.substring(numberEnd);
        }
        else if (line || i === lines.length - 1)
        {
            // Indent if there is something between line breaks or the last linebreak
            lines[i] = indentation + line;
        }
    }

    this.concat(lines.join("\n"));
};

StringBuffer.prototype.concatWithFormat = function(node, scope, before, string, after, isAnchorNode)
{
    if (before)
        this.concatFormat(node, scope, before);

    this.concat(string, isAnchorNode ? node : null);

    if (after)
        this.concatFormat(node, scope, after);
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

ClassDef.prototype.listOfNotImplementedMethodsForProtocols = function(protocolDefs)
{
    var resultList = [],
        instanceMethods = this.getInstanceMethods(),
        classMethods = this.getClassMethods();

    for (var i = 0, size = protocolDefs.length; i < size; i++)
    {
        var protocolDef = protocolDefs[i],
            protocolInstanceMethods = protocolDef.requiredInstanceMethods,
            protocolClassMethods = protocolDef.requiredClassMethods,
            inheritFromProtocols = protocolDef.protocols,
            methodName,
            methodDef;

        if (protocolInstanceMethods)
        {
            for (methodName in protocolInstanceMethods)
            {
                methodDef = protocolInstanceMethods[methodName];

                if (!instanceMethods[methodName])
                    resultList.push({ "methodDef": methodDef, "protocolDef": protocolDef });
            }
        }

        if (protocolClassMethods)
        {
            for (methodName in protocolClassMethods)
            {
                methodDef = protocolClassMethods[methodName];

                if (!classMethods[methodName])
                    resultList.push({ "methodDef": methodDef, "protocolDef": protocolDef });
            }
        }

        if (inheritFromProtocols)
            resultList = resultList.concat(this.listOfNotImplementedMethodsForProtocols(inheritFromProtocols));
    }

    return resultList;
};

ClassDef.prototype.getInstanceMethod = function(name)
{
    var instanceMethods = this.instanceMethods;

    if (instanceMethods)
    {
        var method = instanceMethods[name];

        if (method)
            return method;
    }

    var superClass = this.superClass;

    if (superClass)
        return superClass.getInstanceMethod(name);

    return null;
};

ClassDef.prototype.getClassMethod = function(name)
{
    var classMethods = this.classMethods;

    if (classMethods)
    {
        var method = classMethods[name];

        if (method)
            return method;
    }

    var superClass = this.superClass;

    if (superClass)
        return superClass.getClassMethod(name);

    return null;
};

// Return a new Array with all instance methods
ClassDef.prototype.getInstanceMethods = function()
{
    var instanceMethods = this.instanceMethods;

    if (instanceMethods)
    {
        var superClass = this.superClass,
            returnObject = Object.create(null),
            methodName;

        if (superClass)
        {
            var superClassMethods = superClass.getInstanceMethods();

            for (methodName in superClassMethods)
                returnObject[methodName] = superClassMethods[methodName];
        }

        for (methodName in instanceMethods)
            returnObject[methodName] = instanceMethods[methodName];

        return returnObject;
    }

    return [];
};

// Return a new Array with all class methods
ClassDef.prototype.getClassMethods = function()
{
    var classMethods = this.classMethods;

    if (classMethods)
    {
        var superClass = this.superClass,
            returnObject = Object.create(null),
            methodName;

        if (superClass)
        {
            var superClassMethods = superClass.getClassMethods();

            for (methodName in superClassMethods)
                returnObject[methodName] = superClassMethods[methodName];
        }

        for (methodName in classMethods)
            returnObject[methodName] = classMethods[methodName];

        return returnObject;
    }

    return [];
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

ProtocolDef.prototype.getInstanceMethod = function(name)
{
    var instanceMethods = this.requiredInstanceMethods,
        method;

    if (instanceMethods)
    {
        method = instanceMethods[name];

        if (method)
            return method;
    }

    var protocols = this.protocols;

    for (var i = 0, size = protocols.length; i < size; i++)
    {
        var protocol = protocols[i];

        method = protocol.getInstanceMethod(name);

        if (method)
            return method;
    }

    return null;
};

ProtocolDef.prototype.getClassMethod = function(name)
{
    var classMethods = this.requiredClassMethods,
        method;

    if (classMethods)
    {
        method = classMethods[name];

        if (method)
            return method;
    }

    var protocols = this.protocols;

    for (var i = 0, size = protocols.length; i < size; i++)
    {
        var protocol = protocols[i];

        method = protocol.getInstanceMethod(name);

        if (method)
            return method;
    }

    return null;
};

// methodDef = {"types": types, "name": selector}
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
    this.format = options.format;
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

Compiler.prototype.addWarning = function(/* Warning */ aWarning)
{
    this.warnings.push(aWarning);
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

Compiler.prototype.getClassDef = function(/* String */ aClassName)
{
    if (!aClassName)
        return null;

    var classDef = this.classDefs[aClassName];

    if (classDef)
        return classDef;

    if (typeof objj_getClass === "function")
    {
        var aClass = objj_getClass(aClassName);

        if (aClass)
        {
            var ivars = class_copyIvarList(aClass),
                ivarSize = ivars.length,
                myIvars = Object.create(null),
                protocols = class_copyProtocolList(aClass),
                protocolSize = protocols.length,
                myProtocols = Object.create(null),
                instanceMethodDefs = Compiler.methodDefsFromMethodList(class_copyMethodList(aClass)),
                classMethodDefs = Compiler.methodDefsFromMethodList(class_copyMethodList(aClass.isa)),
                superClass = class_getSuperclass(aClass);

            for (var i = 0; i < ivarSize; i++)
            {
                var ivar = ivars[i];
                myIvars[ivar.name] = {"type": ivar.type, "name": ivar.name};
            }

            for (var i = 0; i < protocolSize; i++)
            {
                var protocol = protocols[i],
                    protocolName = protocol_getName(protocol);

                myProtocols[protocolName] = this.getProtocolDef(protocolName);
            }

            var superClassName = superClass ? this.getClassDef(superClass.name) : null;

            classDef = new ClassDef(true, aClassName, superClassName,
                                    myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
            this.classDefs[aClassName] = classDef;
            return classDef;
        }
    }

    return null;
};

Compiler.prototype.getProtocolDef = function(/* String */ aProtocolName)
{
    if (!aProtocolName)
        return null;

    var p = this.protocolDefs[aProtocolName];

    if (p)
        return p;

    if (typeof objj_getProtocol === "function")
    {
        var aProtocol = objj_getProtocol(aProtocolName);

        if (aProtocol)
        {
            var protocolName = protocol_getName(aProtocol),
                requiredInstanceMethods = protocol_copyMethodDescriptionList(aProtocol, true, true),
                requiredInstanceMethodDefs = Compiler.methodDefsFromMethodList(requiredInstanceMethods),
                requiredClassMethods = protocol_copyMethodDescriptionList(aProtocol, true, false),
                requiredClassMethodDefs = Compiler.methodDefsFromMethodList(requiredClassMethods),
                protocols = aProtocol.protocols,
                inheritFromProtocols = [];

            if (protocols)
            {
                for (var i = 0, size = protocols.length; i < size; i++)
                    inheritFromProtocols.push(this.getProtocolDef(protocols[i].name));
            }

            p = new ProtocolDef(protocolName, inheritFromProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);

            this.protocolDefs[aProtocolName] = p;
            return p;
        }
    }

    return null;
};

Compiler.methodDefsFromMethodList = function(/* Array */ methodList)
{
    var methodSize = methodList.length,
        myMethods = Object.create(null);

    for (var i = 0; i < methodSize; i++)
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
        declarationTemplate = (
            "{\n" +
            "-var the_class = objj_allocateClassPair(%s, \"%s\"),\n" +
            "--meta_class = the_class.isa;\n\n"
            ).replace(/-/g, indentStep);

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

        // FIXME: Use format here
        buffer.concat(util.format(declarationTemplate, node.superclassname.name, className), node);
    }
    else if (node.categoryname)
    {
        classDef = this.getClassDef(className);

        if (!classDef)
            throw this.syntaxError(util.format("Class %s not found", className), node.classname);

        // FIXME: Use format here
        buffer.concat(util.format("{\n%svar the_class = objj_getClass(\"%s\");\n\n", indentStep, className), node);
        buffer.concat(util.format("-if (!the_class)\n--throw new SyntaxError(\"*** Could not find definition for class \\\"%s\\\");\n\n".replace("-", indentStep), className));
        buffer.concat(indentStep + "var meta_class = the_class.isa;\n\n");
    }
    else
    {
        classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));

        // FIXME: Use format here
        buffer.concat(util.format(declarationTemplate, "Nil", className), node);
    }

    return classDef;
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.addIvars = function(node, compileNode, scope, classDef, classScope, flags)
{
    var buffer = this.jsBuffer,
        className = node.classname.name;

    for (var i = 0; i < node.ivardeclarations.length; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarIdentifier = ivarDecl.id,
            ivarName = ivarIdentifier.name,
            ivars = classDef.ivars,
            ivar = {"type": ivarType, "name": ivarName},
            accessors = ivarDecl.accessors;

        if (ivars[ivarName])
            throw compiler.syntaxError(util.format("Instance variable '%s'is already declared for class %s", ivarName,className), ivarIdentifier);

        if (flags.firstIvarDeclaration)
        {
            flags.firstIvarDeclaration = false;
            buffer.concat(indentStep + "class_addIvars(the_class, [\n");
        }
        else
            buffer.concat(",\n");

        if (this.options.generateIvarTypeSignatures)
            buffer.concat(indentStep.repeat(2) + util.format("new objj_ivar(\"%s\", \"%s\")", ivarName, ivarType), node);
        else
            buffer.concat(indentStep.repeat(2) + util.format("new objj_ivar(\"%s\")", ivarName), node);

        if (ivarDecl.outlet)
            ivar.outlet = true;

        ivars[ivarName] = ivar;

        if (!classScope.ivars)
            classScope.ivars = Object.create(null);

        classScope.ivars[ivarName] = { type: "ivar", name: ivarName, node: ivarIdentifier, ivar: ivar};

        if (accessors)
        {
            var info = getAccessorInfo(accessors, ivarName),
                property = info.property,
                getterName = info.getter;

            classDef.addInstanceMethod(new MethodDef(getterName, [ivarType]));

            if (!accessors.readonly)
            {
                var setterName = accessors.setter ? accessors.setter.name : null;

                if (!setterName)
                {
                    var start = property.charAt(0) === "_" ? 1 : 0;

                    setterName = (start ? "_" : "") + "set" + property.charAt(start).toUpperCase() + property.substring(start + 1) + ":";
                }
                classDef.addInstanceMethod(new MethodDef(setterName, ["void", ivarType]));
            }

            flags.hasAccessors = true;
        }
    }
};

// Helper for codeGenerator.ClassDeclarationStatement
Compiler.prototype.generateGetterSetter = function(node)
{
    // FIXME: Use format here
    var getterSetterBuffer = new StringBuffer(this.createSourceMap, this.URL);

    // Add the class declaration to compile accessors correctly
    getterSetterBuffer.concat(this.source.substring(node.start, node.endOfIvars));
    getterSetterBuffer.concat("\n");

    for (var i = 0; i < node.ivardeclarations.length; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarName = ivarDecl.id.name,
            accessors = ivarDecl.accessors;

        if (!accessors)
            continue;

        var info = getAccessorInfo(accessors, ivarName),
            property = info.property,
            getterName = info.getter,
            getterCode = "- (" + (ivarType ? ivarType : "id") + ")" + getterName + "\n{\nreturn " + ivarName + ";\n}\n";

        getterSetterBuffer.concat(getterCode);

        if (accessors.readonly)
            continue;

        var setterName = accessors.setter ? accessors.setter.name : null;

        if (!setterName)
        {
            var start = property.charAt(0) === "_" ? 1 : 0;
            setterName = (start ? "_" : "") + "set" + property.charAt(start).toUpperCase() + property.substring(start + 1) + ":";
        }

        var setterCode = "- (void)" + setterName + "(" + (ivarType ? ivarType : "id") +  ")newValue\n{\n";

        if (accessors.copy)
            setterCode += "if (" + ivarName + " !== newValue)\n" + ivarName + " = [newValue copy];\n}\n";
        else
            setterCode += ivarName + " = newValue;\n}\n";

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

Compiler.prototype.prettifyMessage = function(/* Object */ aMessage, /* String */ messageType)
{
    var line = this.source.substring(aMessage.lineStart, aMessage.lineEnd),
        message = "\n" + line;

    message += " ".repeat(aMessage.column);
    message += "^".repeat(Math.min(1, line.length)) + "\n";
    message += messageType + " line " + aMessage.line + " in " + this.URL + ": " + aMessage.message;

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

var compile = function(node, scope, visitor)
{
    var compileNode = function(node, scope, override)
    {
        visitor[override || node.type](node, scope, compileNode);
    };

    compileNode(node, scope);
};

var compileWithFormat = function(node, scope, visitor, override)
{
    var lastNode, lastComment;

    var compileNode = function(node, scope, override)
    {
        var compiler = scope.compiler,
            includeComments = compiler.includeComments,
            localLastNode = lastNode,
            sameNode = localLastNode === node;

        lastNode = node;

        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment)
        {
            for (var i = 0; i < node.commentsBefore.length; i++)
                compiler.jsBuffer.concat(node.commentsBefore[i]);
        }

        // Overrides get pushed as null, they are not real nodes
        scope.pushNode(node, override);

        if (!sameNode)
            compiler.jsBuffer.concatFormat(node, scope, "before");

        visitor[override || node.type](node, scope, compileNode);

        if (!sameNode)
            compiler.jsBuffer.concatFormat(node, scope, "after");

        scope.popNode();

        if (includeComments && !sameNode && node.commentsAfter)
        {
            for (var i = 0; i < node.commentsAfter.length; i++)
                compiler.jsBuffer.concat(node.commentsAfter[i]);

            lastComment = node.commentsAfter;
        }
        else
            lastComment = null;
    };

    compileNode(node, scope, override);
};

var isIdempotentExpression = function(node)
{
    /* jshint -W004 */

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

// We do not allow dereferencing of expressions with side effects because
// we might need to evaluate the expression twice in certain uses of deref,
// which is not obvious when you look at the deref operator in plain code.
var checkCanDereference = function(scope, node)
{
    if (!isIdempotentExpression(node))
        throw scope.compiler.syntaxError("Dereference of expression with side effects", node);
};

var parenthesize = function(compileNode)
{
    return function(node, scope, override)
    {
        scope.compiler.jsBuffer.concat("(");
        compileNode(node, scope, override);
        scope.compiler.jsBuffer.concat(")");
    };
};

var parenthesizeExpression = function(node, subnode, scope, compileNode, right)
{
    subnodeHasPrecedence(node, subnode, right) ? parenthesize(compileNode) : compileNode(subnode, scope, "Expression");
};

var getAccessorInfo = function(accessors, ivarName)
{
    var property = (accessors.property && accessors.property.name) || ivarName,
        getter = (accessors.getter && accessors.getter.name) || property;

    return { property: property, getter: getter };
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

// Helper for codeGenerator.ClassDeclarationStatement
var checkProtocolConformance = function(compiler, node, classDef, protocols)
{
    // Lookup the protocolDefs for the protocols
    var protocolDefs = [];

    for (var i = 0, size = protocols.length; i < size; i++)
        protocolDefs.push(compiler.getProtocolDef(protocols[i].name));

    var unimplementedMethods = classDef.listOfNotImplementedMethodsForProtocols(protocolDefs);

    if (unimplementedMethods && unimplementedMethods.length > 0)
    {
        for (var i = 0, size = unimplementedMethods.length; i < size; i++)
        {
            var unimplementedMethod = unimplementedMethods[i],
                methodDef = unimplementedMethod.methodDef,
                protocolDef = unimplementedMethod.protocolDef;

            compiler.addWarning(createMessage("Method '" + methodDef.name + "' in protocol '" + protocolDef.name + "' is not implemented", node.classname, compiler.source));
        }
    }
};

// Helper for codeGenerator.MethodDeclarationStatement
var makeSelector = function(compiler, scope, compileNode, nodeArguments, types, selectors, selector)  // -> selector
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

                    if (!compiler.getProtocolDef(argumentProtocol.name))
                        compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source));
                }
            }
        }
    }

    return selector;
};

// Helper for codeGenerator.MethodDeclarationStatement
var compileMethodBody = function(compiler, node, scope, compileNode, nodeArguments, methodScope, selector)
{
    if (node.body)
    {
        compiler.jsBuffer.concat("function");

        if (compiler.options.generateMethodFunctionNames)
            compiler.jsBuffer.concat(" $" + scope.currentClassName() + "__" + selector.replace(/:/g, "_"));

        compiler.jsBuffer.concat("(self, _cmd");

        methodScope.methodType = node.methodtype;

        if (nodeArguments)
        {
            for (var i = 0; i < nodeArguments.length; i++)
            {
                var argument = nodeArguments[i],
                    argumentName = argument.identifier.name;

                compiler.jsBuffer.concat(", ");
                compiler.jsBuffer.concat(argumentName, argument.identifier);

                methodScope.vars[argumentName] = { type: "method argument", node: argument};
            }
        }

        compiler.jsBuffer.concat(")\n");

        indentation += indentStep;
        compileNode(node.body, methodScope, "Statement");
        indentation = indentation.substring(indentSize);

        compiler.jsBuffer.concat("\n");
    }
    else
        compiler.jsBuffer.concat("Nil\n");
};

// Helper for codeGenerator.MethodDeclarationStatement
var checkMethodOverride = function(compiler, node, nodeArguments, types, returnType, alreadyDeclared, selectors, selector)
{
    var declaredTypes = alreadyDeclared.types;

    if (declaredTypes)
    {
        var typeSize = declaredTypes.length;

        if (typeSize > 0)
        {
            // First type is return type
            var declaredReturnType = declaredTypes[0];

            // Create warning if return types are not the same.
            // It is ok if superclass has 'id' and subclass has a class type.
            if (declaredReturnType !== types[0] && !(declaredReturnType === "id" && returnType && returnType.typeisclass))
                compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + declaredReturnType + "' vs '" + types[0] + "'", returnType || node.action || selectors[0], compiler.source));

            // Check the parameter types. The size of the two type arrays
            // should be the same as they have the same selector.
            for (var i = 1; i < typeSize; i++)
            {
                var parameterType = declaredTypes[i];

                if (parameterType !== types[i] && !(parameterType === "id" && nodeArguments[i - 1].type.typeisclass))
                    compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", nodeArguments[i - 1].type || nodeArguments[i - 1].identifier, compiler.source));
            }
        }
    }
};

var dependencyCollector = walk.make(
{
    ImportStatement: function(node, scope)
    {
        var urlString = node.filename.value;

        if (typeof FileDependency !== "undefined")
            scope.compiler.dependencies.push(new FileDependency(new CFURL(urlString), node.isLocal));
        else
            scope.compiler.dependencies.push(urlString);
    }
});

var codeGenerator = walk.make({

Program: function(node, scope, compileNode)
{
    var compiler = scope.compiler;

    indentString = compiler.format.valueForProperty(scope, "*", "indentString");
    indentWidth = compiler.format.valueForProperty(scope, "*", "indentWidth");
    indentSize = indentWidth * indentString.length;
    indentStep = indentString.repeat(indentWidth);
    indentation = "";

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

    // Check for warnings
    var maybeWarnings = scope.maybeWarnings();

    if (maybeWarnings)
    {
        for (var i = 0; i < maybeWarnings.length; i++)
        {
            var maybeWarning = maybeWarnings[i];

            if (maybeWarning.checkIfWarning(scope))
                compiler.addWarning(maybeWarning.message);
        }
    }
},

BlockStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, null, "{", "afterLeftBrace");

    for (var i = 0; i < node.body.length; i++)
        compileNode(node.body[i], scope, "Statement");

    buffer.concatWithFormat(node, scope, "beforeRightBrace", "}");
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
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    compileNode(node.test, scope, "Expression");

    // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
    var expressionClose = node.consequent.type === "EmptyStatement" ? ");" : ")";

    buffer.concatWithFormat(node, scope, null, expressionClose, "afterRightParens");

    indentation += indentStep;
    compileNode(node.consequent, scope, "Statement");
    indentation = indentation.substring(indentSize);

    var alternate = node.alternate;

    if (alternate)
    {
        var alternateNotIf = alternate.type !== "IfStatement",
            emptyStatement = alternate.type === "EmptyStatement",
            elseClause = emptyStatement ? "else;" : "else";

        buffer.concatWithFormat(node, scope, "beforeElse", elseClause, "afterElse");

        if (alternateNotIf)
            indentation += indentStep;
        else
            scope.superNodeIsElse = true;

        compileNode(alternate, scope, "Statement");

        if (alternateNotIf)
            indentation = indentation.substring(indentSize);
    }
},

LabeledStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compileNode(node.label, scope, "IdentifierName");
    buffer.concatWithFormat(node, scope, null, ":", "afterColon");
    compileNode(node.body, scope, "Statement");
},

BreakStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        label = node.label,
        buffer = compiler.jsBuffer;

    if (label)
    {
        buffer.concatWithFormat(node, scope, null, "break", "beforeLabel", true);
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
        buffer.concatWithFormat(node, scope, null, "continue", "beforeLabel", true);
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
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    compileNode(node.object, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");

    indentation += indentStep;
    compileNode(node.body, scope, "Statement");
    indentation = indentation.substring(indentSize);
},

SwitchStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("switch", node);
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(", null, true);

    compileNode(node.discriminant, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");
    buffer.concatWithFormat(node, scope, null, "{", "afterLeftBrace");

    indentation += indentStep;

    for (var i = 0; i < node.cases.length; i++)
    {
        var cs = node.cases[i];

        if (cs.test)
        {
            buffer.concatWithFormat(node, scope, "beforeCase", "case", "afterCase", true);
            compileNode(cs.test, scope, "Expression");
            buffer.concatWithFormat(node, scope, null, ":", "afterColon");
        }
        else
        {
            buffer.concatWithFormat(node, scope, "beforeCase", "default", "afterCase");
            buffer.concatWithFormat(node, scope, null, ":", "afterColon");
        }

        indentation += indentStep;

        for (var j = 0; j < cs.consequent.length; j++)
            compileNode(cs.consequent[j], scope, "Statement");

        indentation = indentation.substring(indentSize);
    }

    indentation = indentation.substring(indentSize);
    buffer.concatWithFormat(node, scope, "beforeRightBrace", "}");
},

ReturnStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("return", node);

    if (node.argument)
    {
        buffer.concatFormat(node, scope, "beforeExpression");
        compileNode(node.argument, scope, "Expression");
    }
},

ThrowStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("throw", node);
    buffer.concatFormat(node, scope, "beforeExpression");

    compileNode(node.argument, scope, "Expression");
},

TryStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("try", node);
    buffer.concatFormat(node, scope, "beforeStatement");

    indentation += indentStep;
    compileNode(node.block, scope, "Statement");
    indentation = indentation.substring(indentSize);

    if (node.handler)
    {
        var handler = node.handler,
            inner = new Scope(scope),
            param = handler.param,
            name = param.name;

        inner.vars[name] = { type: "catch clause", node: param };

        buffer.concatWithFormat(node, scope, "beforeCatch", "catch", "afterCatch");
        buffer.concat("(");
        compileNode(param, scope, "IdentifierName");
        buffer.concat(")");
        buffer.concatFormat(node, scope, "beforeCatchStatement");

        indentation += indentStep;
        inner.skipIndentation = true;
        compileNode(handler.body, inner, "ScopeBody");
        indentation = indentation.substring(indentSize);
        inner.copyAddedSelfToIvarsToParent();
    }

    if (node.finalizer)
    {
        buffer.concatWithFormat(node, scope, "beforeCatch", "finally", "beforeCatchStatement");
        indentation += indentStep;
        scope.skipIndentation = true;
        compileNode(node.finalizer, scope, "Statement");
        indentation = indentation.substring(indentSize);
    }
},

WhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("while", node);
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    compileNode(node.test, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");

    indentation += indentStep;
    compileNode(body, scope, "Statement");
    indentation = indentation.substring(indentSize);
},

DoWhileStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, null, "do", "beforeStatement", true);

    indentation += indentStep;
    compileNode(node.body, scope, "Statement");
    indentation = indentation.substring(indentSize);

    buffer.concat("while");
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    compileNode(node.test, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");
},

ForStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    if (node.init)
        compileNode(node.init, scope, "ForInit");

    buffer.concatWithFormat(node, scope, "afterInitExpression", ";", "afterInitSemicolon");

    if (node.test)
        compileNode(node.test, scope, "Expression");

    buffer.concatWithFormat(node, scope, "afterInitExpression", ";", "afterInitSemicolon");

    if (node.update)
        compileNode(node.update, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");

    indentation += indentStep;
    compileNode(body, scope, "Statement");
    indentation = indentation.substring(indentSize);
},

ForInStatement: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        body = node.body,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);
    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    compileNode(node.left, scope, "ForInit");

    buffer.concatWithFormat(node, scope, "beforeIn", "in", "afterIn");

    compileNode(node.right, scope, "Expression");

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");

    indentation += indentStep;
    compileNode(body, scope, "Statement");
    indentation = indentation.substring(indentSize);
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
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("debugger", node);
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
            buffer.concat(" = ");
        }
    }

    buffer.concat("function", node);

    if (!compiler.transformNamedFunctionToAssignment && id)
    {
        buffer.concat(" ");
        compileNode(id, scope, "IdentifierName");
    }

    buffer.concatWithFormat(node, scope, "beforeLeftParens", "(");

    for (var i = 0; i < node.params.length; i++)
    {
        if (i)
            buffer.concat(",");

        compileNode(node.params[i], scope, "IdentifierName");
    }

    buffer.concatWithFormat(node, scope, null, ")", "afterRightParens");

    indentation += indentStep;
    compileNode(node.body, inner, "ScopeBody");
    indentation = indentation.substring(indentSize);
    inner.copyAddedSelfToIvarsToParent();
},

VariableDeclaration: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        decl,
        identifier;

    buffer.concat("var ", node);

    for (var i = 0; i < node.declarations.length; i++)
    {
        decl = node.declarations[i];
        identifier = decl.id.name;

        if (i > 0)
            buffer.concatWithFormat(node, scope, "beforeComma", ",", "afterComma");

        scope.vars[identifier] = { type: "var", node: decl.id };
        compileNode(decl.id, scope, "IdentifierName");

        if (decl.init)
        {
            buffer.concatWithFormat(node, scope, "beforeAssign", "=", "afterAssign");
            compileNode(decl.init, scope, "Expression");
        }

        // FIXME: Extract to function
        // Here we check back if a ivar with the same name exists and if we have prefixed 'self.' on previous uses.
        // If this is the case we have to remove the prefixes and issue a warning that the variable hides the ivar.
        if (scope.addedSelfToIvars)
        {
            var addedSelfToIvar = scope.addedSelfToIvars[identifier];

            if (addedSelfToIvar)
            {
                var atoms = scope.compiler.jsBuffer.atoms,
                    size = addedSelfToIvar.length;

                for (var i = 0; i < size; i++)
                {
                    var dict = addedSelfToIvar[i];
                    atoms[dict.index] = "";
                    compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", dict.node, compiler.source));
                }

                scope.addedSelfToIvars[identifier] = [];
            }
        }
    }
},

ThisExpression: function(node, scope)
{
    var compiler = scope.compiler;

    compiler.jsBuffer.concat("this", node);
},

ArrayExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer;

    buffer = compiler.jsBuffer;
    buffer.concat("[", node);

    for (var i = 0; i < node.elements.length; i++)
    {
        var elt = node.elements[i];

        if (i !== 0)
            buffer.concatWithFormat(node, scope, "beforeComma", ",", "afterComma");

        if (elt)
            compileNode(elt, scope, "Expression");
    }

    buffer.concat("]");
},

ObjectExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        properties = node.properties,
        buffer = compiler.jsBuffer;

    buffer.concat("{", node);

    for (var i = 0, size = properties.length; i < size; i++)
    {
        var prop = properties[i];

        if (i)
            buffer.concatWithFormat(node, scope, "beforeComma", ",", "afterComma");

        scope.isPropertyKey = true;
        compileNode(prop.key, scope, "Expression");
        delete scope.isPropertyKey;

        buffer.concatWithFormat(node, scope, "beforeColon", ":", "afterColon");
        compileNode(prop.value, scope, "Expression");
    }

    buffer.concat("}");
},

SequenceExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("(");

    for (var i = 0; i < node.expressions.length; i++)
    {
        if (i !== 0)
            buffer.concatWithFormat(node, scope, "beforeComma", ",", "afterComma");

        compileNode(node.expressions[i], scope, "Expression");
    }

    buffer.concat(")");
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

        parenthesizeExpression(node, argument, scope, compileNode);
    }
    else
    {
        parenthesizeExpression(node, argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

UpdateExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.argument.type === "Dereference")
    {
        checkCanDereference(scope, node.argument);

        // Output the dereference function, "(...)(z)"
        buffer.concat((node.prefix ? "" : "(") + "(");
        compileNode(node.argument.expr, scope, "Expression");
        buffer.concat(")(");
        compileNode(node.argument, scope, "Expression");

        var text = " " + node.operator.charAt(0) + " 1)";

        if (node.prefix)
            text += node.operator === "++" ? " - 1)" : " + 1)";

        buffer.concat(text);
        return;
    }

    if (node.prefix)
    {
        buffer.concat(node.operator, node);

        if (wordPrefixOperators(node.operator))
            buffer.concat(" ");

        parenthesizeExpression(node, node.argument, scope, compileNode);
    }
    else
    {
        parenthesizeExpression(node, node.argument, scope, compileNode);
        buffer.concat(node.operator);
    }
},

BinaryExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    parenthesizeExpression(node, node.left, scope, compileNode);
    buffer.concatWithFormat(node, scope, "beforeOperator", node.operator, "afterOperator");
    parenthesizeExpression(node, node.right, scope, compileNode, true);
},

LogicalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    parenthesizeExpression(node, node.left, scope, compileNode);
    buffer.concatWithFormat(node, scope, "beforeOperator", node.operator, "afterOperator");
    parenthesizeExpression(node, node.right, scope, compileNode, true);
},

AssignmentExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.left.type === "Dereference")
    {
        checkCanDereference(scope, node.left);

        // Output the dereference function, "(...)(z)"
        buffer.concat("(");
        compileNode(node.left.expr, scope, "Expression");
        buffer.concat(")(");

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator !== "=")
        {
            compileNode(node.left, scope, "Expression");
            buffer.concat(" " + node.operator.charAt(0) + " ");
        }

        compileNode(node.right, scope, "Expression");
        buffer.concat(")");
    }
    else
    {
        var saveAssignment = scope.assignment;

        scope.assignment = true;
        parenthesizeExpression(node, node.left, scope, compileNode);

        buffer.concatWithFormat(node, scope, "beforeOperator", node.operator, "afterOperator");

        scope.assignment = saveAssignment;
        parenthesizeExpression(node, node.right, scope, compileNode, true);

        if (scope.isRootScope() && node.left.type === "Identifier" && !scope.getLvar(node.left.name))
            scope.vars[node.left.name] = { type: "global", node: node.left };
    }
},

ConditionalExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    parenthesizeExpression(node, node.test, scope, compileNode);

    buffer.concatWithFormat(node, scope, "beforeOperator", "?", "afterOperator");
    compileNode(node.consequent, scope, "Expression");
    buffer.concatWithFormat(node, scope, "beforeOperator", ":", "afterOperator");
    compileNode(node.alternate, scope, "Expression");
},

NewExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer;

    buffer.concat("new ", node);
    parenthesizeExpression(node, node.callee, scope, compileNode);
    buffer.concat("(");

    if (nodeArguments)
    {
        for (var i = 0, size = nodeArguments.length; i < size; i++)
        {
            if (i > 0)
                buffer.concatWithFormat(node, scope, null, ",", "afterComma");

            compileNode(nodeArguments[i], scope, "Expression");
        }
    }

    buffer.concat(")");
},

CallExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer;

    parenthesizeExpression(node, node.callee, scope, compileNode);
    buffer.concat("(");

    if (nodeArguments)
    {
        for (var i = 0, size = nodeArguments.length; i < size; i++)
        {
            if (i > 0)
                buffer.concat(",");

            compileNode(nodeArguments[i], scope, "Expression");
        }
    }

    buffer.concat(")");
},

MemberExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        computed = node.computed;

    parenthesizeExpression(node, node.object, scope, compileNode);
    compiler.jsBuffer.concat(computed ? "[" : ".", node);

    scope.secondMemberExpression = !computed;

    // No parentheses when it is computed, '[' amd ']' are the same thing.
    if (!computed)
        parenthesizeExpression(node, node.property, scope, compileNode);

    scope.secondMemberExpression = false;

    if (computed)
      compiler.jsBuffer.concat("]");
},

Identifier: function(node, scope)
{
    var compiler = scope.compiler,
        identifier = node.name;

    if (scope.currentMethodType() === "-" && !scope.secondMemberExpression && !scope.isPropertyKey)
    {
        var lvar = scope.getLvar(identifier, false), // Only look inside method
            ivar = compiler.getIvarForClass(identifier, scope);

        if (ivar)
        {
            if (lvar)
                compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source));
            else
            {
                // Save the index of where the "self." string is stored and the node.
                // These will be used if we find a variable declaration that is hoisting this identifier.
                if (!scope.addedSelfToIvars)
                    scope.addedSelfToIvars = Object.create(null);

                if (!(identifier in scope.addedSelfToIvars))
                    scope.addedSelfToIvars[identifier] = [];

                scope.addedSelfToIvars[identifier].push({ node: node, index: compiler.jsBuffer.length() });
                compiler.jsBuffer.concat("self.", node);
            }
        }
        // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
        else if (!reservedIdentifiers(identifier))
        {
            var message,
                classOrGlobal = identifier in global || (typeof window !== "undefined" && identifier in window) || compiler.getClassDef(identifier),
                globalVar = scope.getLvar(identifier);

            // It can't be declared with a @class statement
            if (classOrGlobal && (!globalVar || globalVar.type !== "class"))
            {
                /* jshint -W035 */
                if (lvar) {
                    message = compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides global variable", node, compiler.source));
                }
            }
            else if (!globalVar)
            {
                if (scope.assignment)
                {
                    message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source);
                    // Turn off these warnings for this identifier, we only want one.
                    scope.vars[identifier] = { type: "remove global warning", node: node };
                }
                else
                {
                    message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source);
                }
            }

            if (message)
                scope.addMaybeWarning(message);
        }
    }

    compiler.jsBuffer.concat(identifier, node);
},

// Use this when there should not be a look up to issue warnings or add 'self.' before ivars
IdentifierName: function(node, scope)
{
    scope.compiler.jsBuffer.concat(node.name, node);
},

Literal: function(node, scope)
{
    var compiler = scope.compiler;

    if (node.raw && node.raw.charAt(0) === "@")
        compiler.jsBuffer.concat(node.raw.substring(1), node);
    else
        compiler.jsBuffer.concat(node.raw, node);
},

ArrayLiteral: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        elementLength = node.elements.length;

    if (elementLength)
        buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"initWithObjects:count:\", [", node);
    else
        buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"init\")", node);

    if (elementLength)
    {
        for (var i = 0; i < elementLength; i++)
        {
            var elt = node.elements[i];

            if (i)
                buffer.concat(", ");

            compileNode(elt, scope, "Expression");
        }

        buffer.concat("], " + elementLength + ")");
    }
},

DictionaryLiteral: function(node, scope, compileNode)
{
    /* jshint -W004 */
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

    buffer.concat("objj_executeFile(\"", node);
    buffer.concat(node.filename.value);
    buffer.concat(isLocal ? "\", YES);" : "\", NO);");
},

ClassDeclarationStatement: function(node, scope, compileNode)
{
    /* jshint -W004 */
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
        for (var i = 0, size = protocols.length; i < size; i++)
        {
            buffer.concat(util.format("\n%svar aProtocol = objj_getProtocol(\"%s\");\n\n", indentStep, protocols[i].name), protocols[i]);
            buffer.concat(util.format("if (!aProtocol)\n%sthrow new SyntaxError(\"*** Could not find definition for protocol \\\"%s\\\"\");\n\n",
                                      indentStep.repeat(2), protocols[i].name));
            buffer.concat(indentStep + "class_addProtocol(the_class, aProtocol);");
        }
    }

    classScope.classDef = classDef;
    compiler.currentSuperClass = util.format("objj_getClass(\"%s\").super_class", className);
    compiler.currentSuperMetaClass = util.format("objj_getMetaClass(\"%s\").super_class", className);

    var flags = { firstIvarDeclaration: true, hasAccessors: false};

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

    // FIXME: Is this necessary?
    compiler.jsBuffer = buffer;

    // If the class conforms to protocols check that all required methods are implemented
    if (protocols)
        checkProtocolConformance(compiler, node, classDef, protocols);
},

ProtocolDeclarationStatement: function(node, scope, compileNode)
{
    /* jshint -W004 */
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

    buffer.concat("{ var the_protocol = objj_allocateProtocol(\"" + protocolName + "\");", node);

    if (protocols)
    {
        for (var i = 0, size = protocols.length; i < size; i++)
        {
            var protocol = protocols[i],
                inheritFromProtocolName = protocol.name,
                inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

            if (!inheritProtocolDef)
                throw compiler.syntaxError("Can't find protocol " + inheritFromProtocolName, protocol);

            buffer.concat("\nvar aProtocol = objj_getProtocol(\"" + inheritFromProtocolName + "\");", node);
            buffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocolName + "\\\"\");", node);
            buffer.concat("\nprotocol_addProtocol(the_protocol, aProtocol);", node);

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
        buffer.atoms.push.apply(buffer.atoms, compiler.imBuffer.atoms); // FIXME: Move this append to StringBuffer
        buffer.concat("], true, true);\n");
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
        buffer.atoms.push.apply(buffer.atoms, compiler.cmBuffer.atoms); // FIXME: Move this append to StringBuffer
        buffer.concat("], true, false);\n");
    }

    buffer.concat("}");
    compiler.jsBuffer = buffer;
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
    /* jshint -W004 */
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
                compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source));
        }
    }

    compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;

    // Put together the selector. Maybe this should be done in the parser...
    // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
    selector = makeSelector(compiler, scope, compileNode, nodeArguments, types, selectors, selector);

    if (compiler.jsBuffer.isEmpty())           // Add comma separator if this is not first method in this buffer
        compiler.jsBuffer.concat(", ");

    compiler.jsBuffer.concat("new objj_method(sel_getUid(\"", node);
    compiler.jsBuffer.concat(selector);
    compiler.jsBuffer.concat("\"), ");

    compileMethodBody(compiler, node, scope, compileNode, nodeArguments, methodScope, selector);

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
    /* jshint -W004 */
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.superObject)
    {
        // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        buffer.concat("objj_msgSendSuper(", node);
        buffer.concat("{ receiver:self, super_class:" + (scope.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass ) + " }");
    }
    else
    {
        // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        buffer.concat("objj_msgSend(", node);
        compileNode(node.object, scope, "Expression");
    }

    var selectors = node.selectors,
        nodeArguments = node.arguments,
        firstSelector = selectors[0],
        // There is always at least one selector
        selector = firstSelector ? firstSelector.name : "",
        parameters = node.parameters;

    // Put together the selector. Maybe this should be done in the parser...
    for (var i = 0; i < nodeArguments.length; i++)
    {
        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";
    }

    buffer.concat(", \"");
    buffer.concat(selector); // FIXME: sel_getUid(selector + "") ? This FIXME is from the old preprocessor compiler
    buffer.concat("\"");

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
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("sel_getUid(\"", node);
    buffer.concat(node.selector);
    buffer.concat("\")");
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

    buffer.concat("function(__input) { if (arguments.length) return ", node);
    buffer.concat(node.element.name);
    buffer.concat(" = __input; return ");
    buffer.concat(node.element.name);
    buffer.concat("; }");
},

Dereference: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    checkCanDereference(scope, node.expr);

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

PreprocessStatement: function(node, scope)
{
}
});  // var codeGenerator = walk.make()
