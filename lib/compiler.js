/*
 * compiler.j
 *
 * Created by Martin Carlberg.
 * Copyright 2013, Martin Carlberg.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */


/* global define, acorn, window, CFURL, Executable, FileDependency, objj_getClass, objj_getProtocol, class_copyIvarList, class_copyProtocolList, class_copyMethodList, class_getSuperclass, method_getName, protocol_getName, protocol_copyMethodDescriptionList */

(function(mod)
{
    "use strict";

    // CommonJS
    if (typeof exports === "object" && typeof module === "object")
        return mod(
            exports,
            require("objj-acorn/acorn"),
            require("objj-acorn/util/walk"),
            require("source-map"));

    // AMD
    if (typeof define === "function" && define.amd)
        return define(
            [
                "exports",
                "objj-acorn/acorn",
                "objj-acorn/util/walk",
                "source-map"
            ], mod);

    // Browser
    mod(this.objjCompiler || (this.objjCompiler = {}), acorn, acorn.walk, null);
})
(function(exports, acorn, walk, sourceMap)
{
"use strict";

exports.version = "0.5.0";
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

    // If true, the compiler generates source code from the AST. If false, the compiler copies source code
    // from the source file.
    // WARNING: The preprocessor does not work if this is false.
    generate: true,

    // If true, the compiler generates Objective-J code instead of JavaScript code. Of course this is really
    // only useful if you want the compiler to reformat/beautify the code.
    generateObjJ: false,

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
    generateIvarTypeSignatures: true,
};

function setupOptions(options)
{
    options = options || Object.create(null);

    for (var option in defaultOptions)
    {
        if (!options.hasOwnProperty(option))
        {
            var defaultOption = defaultOptions[option];
            options[option] = typeof defaultOption === "function" ? defaultOption() : defaultOption;
        }
    }

    return options;
}

var Scope = function(prev, base)
{
    this.vars = Object.create(null);

    if (base)
        for (var key in base)
            this[key] = base[key];

    this.prev = prev;

    if (prev)
    {
        this.compiler = prev.compiler;
        this.nodeStack = prev.nodeStack.slice(0);
        this.nodePriorStack = prev.nodePriorStack.slice(0);
        this.nodeStackOverrideType = prev.nodeStackOverrideType.slice(0);
    }
    else
    {
        this.nodeStack = [];
        this.nodePriorStack = [];
        this.nodeStackOverrideType = [];
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
    return this.classDef ? this.classDef.name : this.prev ? this.prev.currentClassName() : null;
};

Scope.prototype.currentProtocolName = function()
{
    return this.protocolDef ? this.protocolDef.name : this.prev ? this.prev.currentProtocolName() : null;
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

Scope.prototype.getLvar = function(/* String */ lvarName, /* BOOL */ stopAtMethod)
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
    return this.methodType ? this.methodType : this.prev ? this.prev.currentMethodType() : null;
};

Scope.prototype.copyAddedSelfToIvarsToParent = function()
{
  if (this.prev && this.addedSelfToIvars) for (var key in this.addedSelfToIvars)
  {
    var addedSelfToIvar = this.addedSelfToIvars[key],
        scopeAddedSelfToIvar = (this.prev.addedSelfToIvars || (this.prev.addedSelfToIvars = Object.create(null)))[key] || (this.prev.addedSelfToIvars[key] = []);

    // Append at end in parent scope
    scopeAddedSelfToIvar.push.apply(scopeAddedSelfToIvar, addedSelfToIvar);
  }
};

Scope.prototype.addMaybeWarning = function(warning)
{
    var rootScope = this.rootScope();

    (rootScope._maybeWarnings || (rootScope._maybeWarnings = [])).push(warning);
};

Scope.prototype.maybeWarnings = function()
{
    return this.rootScope()._maybeWarnings;
};

Scope.prototype.pushNode = function(node, overrideType)
{
    /*
        Here we push 3 things onto a stack. The node, override type and an array
        that can keep track of prior nodes on this level. The current node is also
        pushed to the last prior array.

        Special-case when the node is the same as the parent node. This happens
        when using an override type when walking the AST. The same prior list is
        then used instead of a new empty one.
    */
    var nodePriorStack = this.nodePriorStack,
        length = nodePriorStack.length,
        lastPriorList = length ? nodePriorStack[length - 1] : null,
        lastNode = length ? this.nodeStack[length - 1] : null;

    // First add this node to the parent list of nodes, if it has one.
    // If not the same node push the node.
    if (lastPriorList && lastNode !== node)
        lastPriorList.push(node);

    // Use the last prior list if it is the same node
    nodePriorStack.push(lastNode === node ? lastPriorList : []);
    this.nodeStack.push(node);
    this.nodeStackOverrideType.push(overrideType);
};

Scope.prototype.popNode = function()
{
    this.nodeStackOverrideType.pop();
    this.nodePriorStack.pop();
    return this.nodeStack.pop();
};

Scope.prototype.currentNode = function()
{
    var nodeStack = this.nodeStack;
    return nodeStack[nodeStack.length - 1];
};

Scope.prototype.currentOverrideType = function()
{
    var nodeStackOverrideType = this.nodeStackOverrideType;
    return nodeStackOverrideType[nodeStackOverrideType.length - 1];
};

Scope.prototype.priorNode = function()
{
    var nodePriorStack = this.nodePriorStack,
        length = nodePriorStack.length;

    if (length > 1)
    {
        var parent = nodePriorStack[length - 2];
        return parent[parent.length - 2] || null;
    }

    return null;
};

Scope.prototype.format = function(index, format, useOverrideForNode)
{
    var nodeStack = this.nodeStack,
        length = nodeStack.length;

    index = index || 0;

    if (index >= length)
        return null;

    // Get the nodes backwards from the stack
    var i = length - index - 1,
        currentNode = nodeStack[i],
        currentFormat = format || this.compiler.format,

        // Get the parent descriptions except if no format was provided, then it is the root description
        parentFormats = format ? format.parent : currentFormat,
        nextFormat;

    if (parentFormats)
    {
        var nodeType = useOverrideForNode === currentNode ? this.nodeStackOverrideType[i] : currentNode.type;
        nextFormat = parentFormats[nodeType];

        if (useOverrideForNode === currentNode && !nextFormat)
            return null;
    }

    if (nextFormat)
    {
        // Check for more 'parent' attributes or return nextFormat
        return this.format(index + 1, nextFormat);
    }
    else
    {
        // Check for a virtual node one step up in the stack
        nextFormat = this.format(index + 1, format, currentNode);

        if (nextFormat)
            return nextFormat;
        else
        {
            // Ok, we have found a format description (currentFormat).
            // Lets check if we have any other descriptions dependent on the prior node.
            var priorFormats = currentFormat.prior;

            if (priorFormats)
            {
                var priorNode = this.priorNode(),
                    priorFormat = priorFormats[priorNode ? priorNode.type : "None"];

                if (priorFormat)
                    return priorFormat;
            }

            return currentFormat;
        }
    }
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

function StringBuffer(useSourceNode, file)
{
    if (useSourceNode)
    {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringSourceNode;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        this.length = this.lengthSourceNode;
        this.file = file;
    }
    else
    {
        this.atoms = [];
        this.concat = this.concatString;
        this.toString = this.toStringString;
        this.isEmpty = this.isEmptyString;
        this.appendStringBuffer = this.appendStringBufferString;
        this.length = this.lengthString;
    }
}

StringBuffer.prototype.toStringString = function()
{
    return this.atoms.join("");
};

StringBuffer.prototype.toStringSourceNode = function()
{
    return this.rootNode.toStringWithSourceMap({file: this.file});
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

// '\n' will indent. '\n\<N>' will indent or dedent by <N> levels.
StringBuffer.prototype.concatFormat = function(aString)
{
    if (!aString)
        return;

    var lines = aString.split("\n"),
        size = lines.length;

    if (size > 1)
    {
        this.concat(lines[0]);

        for (var i = 1; i < size; i++)
        {
            var line = lines[i];
            this.concat("\n");

            if (line.slice(0, 1) === "\\")
            {
                var numberLength = 1,
                    indent = line.slice(1, 1 + numberLength);

                if (indent === "-")
                {
                    numberLength = 2;
                    indent = line.slice(1, 1 + numberLength);
                }

                var indentationNumber = parseInt(indent, 10);

                if (indentationNumber)
                {
                    this.concat(indentationNumber > 0 ?
                                indentation + new Array(indentationNumber * indentWidth + 1).join(indentString) :
                                indentation.substring(indentSize * -indentationNumber));
                }

                line = line.slice(1 + numberLength);
            }
            else if (line || i === size - 1)
            {
                // Ident if there is something between line breaks or the last linebreak
                this.concat(indentation);
            }

            if (line)
                this.concat(line);
        }
    }
    else
        this.concat(aString);
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

StringBuffer.prototype.lengthString = function()
{
    return this.atoms.length;
};

StringBuffer.prototype.lengthSourceNode = function()
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
                    resultList.push({"methodDef": methodDef, "protocolDef": protocolDef});
            }
        }

        if (protocolClassMethods)
        {
            for (methodName in protocolClassMethods)
            {
                methodDef = protocolClassMethods[methodName];

                if (!classMethods[methodName])
                    resultList.push({"methodDef": methodDef, "protocolDef": protocolDef});
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
    (this.requiredInstanceMethods || (this.requiredInstanceMethods = Object.create(null)))[methodDef.name] = methodDef;
};

ProtocolDef.prototype.addClassMethod = function(methodDef)
{
    (this.requiredClassMethods || (this.requiredClassMethods = Object.create(null)))[methodDef.name] = methodDef;
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

var Compiler = function(/*String*/ source, /*String*/ url, options)
{
    this.source = source;
    this.URL = typeof CFURL !== "undefined" ? new CFURL(url) : url;
    this.options = options = setupOptions(options);
    this.generateWhat = options.generateWhat;
    this.classDefs = options.classDefs;
    this.protocolDefs = options.protocolDefs;
    this.generate = options.generate;
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

    var compiler = compile,
        generator;

    if (this.generateWhat === CompilerGenerateCode)
    {
        generator = codeGenerator;

        if (options.includeComments || options.format)
            compiler = compileWithFormat;
    }
    else
        generator = dependencyCollector;

    compiler(this.AST, new Scope(null, {compiler: this}), generator);

    if (this.createSourceMap)
    {
         var s = this.jsBuffer.toString();
         this.compiledCode = s.code;
         this.sourceMap = s.map;
     }
     else
     {
         this.compiledCode = this.jsBuffer.toString();
     }
};

exports.compileToExecutable = function(/*String*/ source, /*CFURL*/ url, options)
{
    Compiler.currentCompileFile = url;
    return new Compiler(source, url, options).executable();
};

exports.compileToIMBuffer = function(/*String*/ source, /*CFURL*/ url, options, classDefs, protocolDefs)
{
    options.classDefs = classDefs;
    options.protocolDefs = protocolDefs;

    var compiler = new Compiler(source, url, options).IMBuffer();

    options.classDefs = options.protocolDefs = null;
    return compiler;
};

exports.compile = function(/*String*/ source, /*CFURL*/ url, options)
{
    return new Compiler(source, url, options);
};

exports.compileFileDependencies = function(/*String*/ source, /*CFURL*/ url, options)
{
    Compiler.currentCompileFile = url;
    (options || (options = {})).generateWhat = CompilerGenerateFileDependencies;
    return new Compiler(source, url, options).executable();
};

Compiler.prototype.compilePass2 = function()
{
    Compiler.currentCompileFile = this.URL;
    this.generateWhat = CompilerGenerateCode;
    this.jsBuffer = new StringBuffer(this.createSourceMap, this.URL);
    this.warnings = [];
    // FIXME: This will fail, since compilePass2 is not defined
    //compilePass2(this.AST, new Scope(null ,{ compiler: this }), codeGenerator);

    for (var i = 0; i < this.warnings.length; i++)
    {
       var message = this.prettifyMessage(this.warnings[i], "WARNING");
       console.log(message);
    }

    return this.jsBuffer.toString();
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

    var c = this.getClassDef(scope.currentClassName());

    while (c)
    {
        var ivars = c.ivars;

        if (ivars)
        {
            var ivarDef = ivars[ivarName];

            if (ivarDef)
                return ivarDef;
        }

        c = c.superClass;
    }
};

Compiler.prototype.getClassDef = function(/* String */ aClassName)
{
    if (!aClassName)
        return null;

    var c = this.classDefs[aClassName];

    if (c)
        return c;

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

            for (i = 0; i < protocolSize; i++)
            {
                var protocol = protocols[i],
                    protocolName = protocol_getName(protocol),
                    protocolDef = this.getProtocolDef(protocolName);

                myProtocols[protocolName] = protocolDef;
            }

            c = new ClassDef(true, aClassName, superClass ? this.getClassDef(superClass.name) : null,
                             myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
            this.classDefs[aClassName] = c;
            return c;
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
    return this.compiledCode;
};

Compiler.prototype.ast = function()
{
    return JSON.stringify(this.AST, null, indentWidth);
};

Compiler.prototype.map = function()
{
    return JSON.stringify(this.sourceMap);
};

Compiler.prototype.prettifyMessage = function(/* Message */ aMessage, /* String */ messageType)
{
    var line = this.source.substring(aMessage.lineStart, aMessage.lineEnd),
        message = "\n" + line;

    message += (new Array(aMessage.column + 1)).join(" ");
    message += (new Array(Math.min(1, line.length) + 1)).join("^") + "\n";
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
    if (!Compiler.importStack)
        Compiler.importStack = [];

    Compiler.importStack.push(url);
};

Compiler.prototype.popImport = function()
{
    Compiler.importStack.pop();
};

function createMessage(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code)
{
    var message = acorn.getLineInfo(code, node.start);

    message.message = aMessage;

    return message;
}

function compile(node, state, visitor)
{
    function compileNode(node, state, override)
    {
        visitor[override || node.type](node, state, compileNode);
    }

    compileNode(node, state);
}

function compileWithFormat(node, state, visitor)
{
    var lastNode, lastComment;

    function compileNode(node, state, override)
    {
        var compiler = state.compiler,
            includeComments = compiler.includeComments,
            localLastNode = lastNode,
            sameNode = localLastNode === node,
            i;

        lastNode = node;

        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment)
        {
            for (i = 0; i < node.commentsBefore.length; i++)
                compiler.jsBuffer.concat(node.commentsBefore[i]);
        }

        state.pushNode(node, override);

        var format = state.format();

        //console.log("format: " + JSON.stringify(format) + ", node.type: " + node.type + ", override: " + override);

        if (!sameNode && format && format.before)
            compiler.jsBuffer.concatFormat(format.before);

        visitor[override || node.type](node, state, compileNode, format);

        if (!sameNode && format && format.after)
            compiler.jsBuffer.concatFormat(format.after);

        state.popNode();

        if (includeComments && !sameNode && node.commentsAfter)
        {
            for (i = 0; i < node.commentsAfter.length; i++)
                compiler.jsBuffer.concat(node.commentsAfter[i]);

            lastComment = node.commentsAfter;
        }
        else
            lastComment = null;
    }

    compileNode(node, state);
}

function isIdempotentExpression(node)
{
    /* jshint -W004 */

    switch (node.type)
    {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (var i = 0; i < node.elements.length; ++i)
            {
                if (!isIdempotentExpression(node.elements[i]))
                    return false;
            }

            return true;

        case "DictionaryLiteral":
            for (var i = 0; i < node.keys.length; ++i)
            {
                if (!isIdempotentExpression(node.keys[i]))
                    return false;

                if (!isIdempotentExpression(node.values[i]))
                    return false;
            }

            return true;

        case "ObjectExpression":
            for (var i = 0; i < node.properties.length; ++i)
                if (!isIdempotentExpression(node.properties[i].value))
                    return false;

            return true;

        case "FunctionExpression":
            for (var i = 0; i < node.params.length; ++i)
                if (!isIdempotentExpression(node.params[i]))
                    return false;

            return true;

        case "SequenceExpression":
            for (var i = 0; i < node.expressions.length; ++i)
                if (!isIdempotentExpression(node.expressions[i]))
                    return false;

            return true;

        case "UnaryExpression":
            return isIdempotentExpression(node.argument);

        case "BinaryExpression":
            return isIdempotentExpression(node.left) && isIdempotentExpression(node.right);

        case "ConditionalExpression":
            return isIdempotentExpression(node.test) && isIdempotentExpression(node.consequent) && isIdempotentExpression(node.alternate);

        case "MemberExpression":
            return isIdempotentExpression(node.object) && (!node.computed || isIdempotentExpression(node.property));

        case "Dereference":
            return isIdempotentExpression(node.expr);

        case "Reference":
            return isIdempotentExpression(node.element);

        default:
            return false;
    }
}

// We do not allow dereferencing of expressions with side effects because
// we might need to evaluate the expression twice in certain uses of deref,
// which is not obvious when you look at the deref operator in plain code.
function checkCanDereference(state, node)
{
    if (!isIdempotentExpression(node))
        throw state.compiler.syntaxError("Dereference of expression with side effects", node);
}

function parenthesize(compileNode)
{
    return function(node, state, override, format)
    {
        state.compiler.jsBuffer.concat("(");
        compileNode(node, state, override, format);
        state.compiler.jsBuffer.concat(")");
    };
}

function parenthesizeExpression(generate, node, subnode, state, compileNode, right)
{
    (generate && subnodeHasPrecedence(node, subnode, right) ? parenthesize(compileNode) : compileNode)(subnode, state, "Expression");
}

function getAccessorInfo(accessors, ivarName)
{
    var property = (accessors.property && accessors.property.name) || ivarName,
        getter = (accessors.getter && accessors.getter.name) || property;

    return { property: property, getter: getter };
}

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
function subnodeHasPrecedence(node, subnode, right)
{
    var nodeType = node.type,
        nodePrecedence = expressionTypePrecedence[nodeType] || -1,
        subnodePrecedence = expressionTypePrecedence[subnode.type] || -1,
        nodeOperatorPrecedence,
        subnodeOperatorPrecedence;

    return subnodePrecedence > nodePrecedence ||
           (nodePrecedence === subnodePrecedence && isLogicalOrBinaryExpression(nodeType) &&
            ((subnodeOperatorPrecedence = operatorPrecedence[subnode.operator]) > (nodeOperatorPrecedence = operatorPrecedence[node.operator]) ||
             (right === true && nodeOperatorPrecedence === subnodeOperatorPrecedence)
            )
           );
}

var dependencyCollector = walk.make(
{
    ImportStatement: function(node, state)
    {
        var urlString = node.filename.value;

        if (typeof FileDependency !== "undefined")
            state.compiler.dependencies.push(new FileDependency(new CFURL(urlString), node.isLocal));
        else
            state.compiler.dependencies.push(urlString);
    }
});

var indentString = defaultOptions.indentString,
    indentWidth = defaultOptions.indentWidth,
    indentSize = indentWidth * indentString.length,
    indentStep = new Array(indentWidth + 1).join(indentString),
    indentation = "";

var codeGenerator = walk.make({

Program: function(node, state, compileNode)
{
    var compiler = state.compiler;

    indentString = compiler.options.indentString;
    indentWidth = compiler.options.indentWidth;
    indentSize = indentWidth * indentString.length;
    indentStep = new Array(indentWidth + 1).join(indentString);
    indentation = "";

    for (var i = 0; i < node.body.length; ++i)
        compileNode(node.body[i], state, "Statement");

    if (!compiler.generate)
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.end));

    // Check for warnings
    var maybeWarnings = state.maybeWarnings();

    if (maybeWarnings)
    {
        for (i = 0; i < maybeWarnings.length; i++)
        {
            var maybeWarning = maybeWarnings[i];

            if (maybeWarning.checkIfWarning(state))
                compiler.addWarning(maybeWarning.message);
        }
    }
},

BlockStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        skipIndentation = state.skipIndentation,
        buffer;

    if (compiler.generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("{");
            buffer.concatFormat(format.afterLeftBrace);
        }
        else
        {
            if (skipIndentation)
                delete state.skipIndentation;
            else
                buffer.concat(indentation.substring(indentSize));

            buffer.concat("{\n");
        }
    }

    for (var i = 0; i < node.body.length; ++i)
        compileNode(node.body[i], state, "Statement");

    if (compiler.generate)
    {
        if (format)
        {
            buffer.concatFormat(format.beforeRightBrace);
            buffer.concat("}");
        }
        else
        {
            buffer.concat(indentation.substring(indentSize));
            buffer.concat("}");

            if (!skipIndentation && state.isDecl !== false)
                buffer.concat("\n");

            state.indentBlockLevel--;
        }
    }
},

ExpressionStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate && !format;

    if (generate)
        compiler.jsBuffer.concat(indentation);

    compileNode(node.expression, state, "Expression");

    if (generate)
        compiler.jsBuffer.concat(";\n");
},

IfStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        buffer;

    if (compiler.generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("if", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            // Keep the 'else' and 'if' on the same line if it is an 'else if'
            if (!state.superNodeIsElse)
                buffer.concat(indentation);
            else
                delete state.superNodeIsElse;

            buffer.concat("if (", node);
        }
    }

    compileNode(node.test, state, "Expression");

    if (compiler.generate)
    {
        // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
        var expressionClose = node.consequent.type === "EmptyStatement" ? ");" : ")";

        if (format)
        {
            buffer.concat(expressionClose);
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
            buffer.concat(expressionClose + "\n");
    }

    indentation += indentStep;
    compileNode(node.consequent, state, "Statement");
    indentation = indentation.substring(indentSize);

    var alternate = node.alternate;

    if (alternate)
    {
        var alternateNotIf = alternate.type !== "IfStatement";

        if (compiler.generate)
        {
            var emptyStatement = alternate.type === "EmptyStatement",
                elseClause = emptyStatement ? "else;" : "else";

            if (format)
            {
                buffer.concatFormat(format.beforeElse); // Do we need this?
                buffer.concat(elseClause);
                buffer.concatFormat(format.afterElse);
            }
            else
            {
                buffer.concat(indentation + elseClause);
                buffer.concat(alternateNotIf ? "\n" : " ");
            }
        }

        if (alternateNotIf)
            indentation += indentStep;
        else
            state.superNodeIsElse = true;

        compileNode(alternate, state, "Statement");

        if (alternateNotIf)
            indentation = indentation.substring(indentSize);
    }
},

LabeledStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler;

    if (compiler.generate)
    {
        var buffer = compiler.jsBuffer;

        if (!format)
            buffer.concat(indentation);

        compileNode(node.label, state, "IdentifierName");

        if (format)
        {
            buffer.concat(":");
            buffer.concatFormat(format.afterColon);
        }
        else
            buffer.concat(": ");
    }

    compileNode(node.body, state, "Statement");
},

BreakStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler;

    if (compiler.generate)
    {
        var label = node.label,
            buffer = compiler.jsBuffer;

        if (!format)
            buffer.concat(indentation);

        if (label)
        {
            if (format)
            {
                buffer.concat("break", node);
                buffer.concatFormat(format.beforeLabel);
            }
            else
                buffer.concat("break ", node);

            compileNode(label, state, "IdentifierName");

            if (!format)
                buffer.concat(";\n");
        }
        else
            buffer.concat(format ? "break" : "break;\n", node);
    }
},

ContinueStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler;

    if (compiler.generate)
    {
        var label = node.label,
            buffer = compiler.jsBuffer;

        if (!format)
            buffer.concat(indentation);

        if (label)
        {
            if (format)
            {
                buffer.concat("continue", node);
                buffer.concatFormat(format.beforeLabel);
            }
            else
                buffer.concat("continue ", node);

            compileNode(label, state, "IdentifierName");

            if (!format)
                buffer.concat(";\n");
        }
        else
            buffer.concat(format ? "continue" : "continue;\n", node);
    }
},

WithStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        buffer;

    if (compiler.generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("with", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("with(", node);
        }
    }

    compileNode(node.object, state, "Expression");

    if (compiler.generate)
    {
        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
            buffer.concat(")\n");
    }

    indentation += indentStep;
    compileNode(node.body, state, "Statement");
    indentation = indentation.substring(indentSize);
},

SwitchStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("switch", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(", node);
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("switch (", node);
        }
    }

    compileNode(node.discriminant, state, "Expression");

    if (generate)
    {
        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
            buffer.concat("{");
            buffer.concatFormat(format.afterLeftBrace);
        }
        else
            buffer.concat(") {\n");
    }

    indentation += indentStep;

    for (var i = 0; i < node.cases.length; ++i)
    {
        var cs = node.cases[i];

        if (cs.test)
        {
            if (generate)
            {
                if (format)
                {
                    buffer.concatFormat(format.beforeCase);
                    buffer.concat("case", node);
                    buffer.concatFormat(format.afterCase);
                }
                else
                {
                    buffer.concat(indentation);
                    buffer.concat("case ");
                }
            }

            compileNode(cs.test, state, "Expression");

            if (generate)
            {
                if (format)
                {
                    buffer.concat(":");
                    buffer.concatFormat(format.afterColon);
                }
                else
                    buffer.concat(":\n");
            }
        }
        else if (generate)
        {
            if (format)
            {
                buffer.concatFormat(format.beforeCase);
                buffer.concat("default");
                buffer.concatFormat(format.afterCase);
                buffer.concat(":");
                buffer.concatFormat(format.afterColon);
            }
            else
                buffer.concat("default:\n");
        }

        indentation += indentStep;

        for (var j = 0; j < cs.consequent.length; ++j)
            compileNode(cs.consequent[j], state, "Statement");

        indentation = indentation.substring(indentSize);
    }

    indentation = indentation.substring(indentSize);

    if (generate)
    {
        if (format)
        {
            buffer.concatFormat(format.beforeRightBrace);
            buffer.concat("}");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("}\n");
        }
    }
},

ReturnStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (!format)
            buffer.concat(indentation);

        buffer.concat("return", node);
    }

    if (node.argument)
    {
        if (generate)
            buffer.concatFormat(format ? format.beforeExpression : " ");

        compileNode(node.argument, state, "Expression");
    }

    if (generate && !format)
        buffer.concat(";\n");
},

ThrowStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (!format)
            buffer.concat(indentation);

        buffer.concat("throw", node);
        buffer.concatFormat(format ? format.beforeExpression : " ");
    }

    compileNode(node.argument, state, "Expression");

    if (generate && !format)
        buffer.concat(";\n");
},

TryStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;
        if (!format) buffer.concat(indentation);
        buffer.concat("try", node);
        buffer.concatFormat(format ? format.beforeStatement : " ");
    }

    indentation += indentStep;

    if (!format)
        state.skipIndentation = true;

    compileNode(node.block, state, "Statement");
    indentation = indentation.substring(indentSize);

    if (node.handler)
    {
        var handler = node.handler,
                inner = new Scope(state),
                param = handler.param,
                name = param.name;

        inner.vars[name] = {type: "catch clause", node: param};

        if (generate)
        {
            if (format)
            {
                buffer.concatFormat(format.beforeCatch);
                buffer.concat("catch");
                buffer.concatFormat(format.afterCatch);
                buffer.concat("(");
                compileNode(param, state, "IdentifierName");
                buffer.concat(")");
                buffer.concatFormat(format.beforeCatchStatement);
            }
            else
            {
                buffer.concat("\n");
                buffer.concat(indentation);
                buffer.concat("catch(");
                buffer.concat(name);
                buffer.concat(") ");
            }
        }

        indentation += indentStep;
        inner.skipIndentation = true;
        compileNode(handler.body, inner, "ScopeBody");
        indentation = indentation.substring(indentSize);
        inner.copyAddedSelfToIvarsToParent();
    }

    if (node.finalizer)
    {
        if (generate)
        {
            if (format)
            {
                buffer.concatFormat(format.beforeCatch);
                buffer.concat("finally");
                buffer.concatFormat(format.beforeCatchStatement);
            }
            else
            {
                buffer.concat("\n");
                buffer.concat(indentation);
                buffer.concat("finally ");
            }
        }

        indentation += indentStep;
        state.skipIndentation = true;
        compileNode(node.finalizer, state, "Statement");
        indentation = indentation.substring(indentSize);
    }

    if (generate && !format)
        buffer.concat("\n");
},

WhileStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("while", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("while (", node);
        }
    }

    compileNode(node.test, state, "Expression");

    if (generate)
    {
        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
        {
            // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
            buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
        }
    }

    indentation += indentStep;
    compileNode(body, state, "Statement");
    indentation = indentation.substring(indentSize);
},

DoWhileStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("do", node);
            buffer.concatFormat(format.beforeStatement);
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("do\n", node);
        }
    }

    indentation += indentStep;
    compileNode(node.body, state, "Statement");
    indentation = indentation.substring(indentSize);

    if (generate)
    {
        if (format)
        {
            buffer.concat("while");
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("while (");
        }
    }

    compileNode(node.test, state, "Expression");

    if (generate)
        buffer.concatFormat(format ? ")" : ");\n");
},

ForStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("for", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("for (", node);
        }
    }

    if (node.init)
        compileNode(node.init, state, "ForInit");

    if (generate)
        buffer.concat(format ? ";" : "; ");

    if (node.test)
        compileNode(node.test, state, "Expression");

    if (generate)
        buffer.concat(format ? ";" : "; ");

    if (node.update)
        compileNode(node.update, state, "Expression");

    if (generate)
    {
        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
        {
            // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
            buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
        }
    }

    indentation += indentStep;
    compileNode(body, state, "Statement");
    indentation = indentation.substring(indentSize);
},

ForInStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concat("for", node);
            buffer.concatFormat(format.beforeLeftParenthesis);
            buffer.concat("(");
        }
        else
        {
            buffer.concat(indentation);
            buffer.concat("for (", node);
        }
    }

    compileNode(node.left, state, "ForInit");

    if (generate)
    {
        if (format)
        {
            buffer.concatFormat(format.beforeIn);
            buffer.concat("in");
            buffer.concatFormat(format.afterIn);
        }
        else
            buffer.concat(" in ");
    }

    compileNode(node.right, state, "Expression");

    if (generate)
    {
        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
        {
            // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
            buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
        }
    }

    indentation += indentStep;
    compileNode(body, state, "Statement");
    indentation = indentation.substring(indentSize);
},

ForInit: function(node, state, compileNode)
{
    if (node.type === "VariableDeclaration")
    {
        state.isFor = true;
        compileNode(node, state);
        delete state.isFor;
    }
    else
      compileNode(node, state, "Expression");
},

DebuggerStatement: function(node, state, compileNode, format)
{
    var compiler = state.compiler;

    if (compiler.generate)
    {
        var buffer = compiler.jsBuffer;

        if (format)
            buffer.concat("debugger", node);
        else
        {
            buffer.concat(indentation);
            buffer.concat("debugger;\n", node);
        }
    }
},

Function: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        inner = new Scope(state),
        decl = node.type === "FunctionDeclaration",
        id = node.id;

    inner.isDecl = decl;

    for (var i = 0; i < node.params.length; ++i)
        inner.vars[node.params[i].name] = {type: "argument", node: node.params[i]};

    if (generate && !format)
        buffer.concat(indentation);

    if (id)
    {
        var name = id.name;
        (decl ? state : inner).vars[name] = {type: decl ? "function" : "function name", node: id};

        if (compiler.transformNamedFunctionToAssignment)
        {
            if (generate)
            {
                buffer.concat(name);
                buffer.concat(" = ");
            }
            else
            {
                buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
                buffer.concat(name);
                buffer.concat(" = function");
                compiler.lastPos = id.end;
            }
        }
    }

    if (generate)
    {
        buffer.concat("function", node);

        if (!compiler.transformNamedFunctionToAssignment && id)
        {
            if (!format)
                buffer.concat(" ");

            compileNode(id, state, "IdentifierName");
        }

        if (format)
            buffer.concatFormat(format.beforeLeftParenthesis);

        buffer.concat("(");

        for (i = 0; i < node.params.length; ++i)
        {
            if (i)
                buffer.concat(format ? "," : ", ");

            compileNode(node.params[i], state, "IdentifierName");
        }

        if (format)
        {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        }
        else
            buffer.concat(")\n");
    }

    indentation += indentStep;
    compileNode(node.body, inner, "ScopeBody");
    indentation = indentation.substring(indentSize);
    inner.copyAddedSelfToIvarsToParent();
},

VariableDeclaration: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer,
        decl,
        identifier;

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (!state.isFor && !format)
            buffer.concat(indentation);

        buffer.concat(format ? "var" : "var ", node);
    }

    for (var i = 0; i < node.declarations.length; ++i)
    {
        decl = node.declarations[i];
        identifier = decl.id.name;

        if (i)
        {
            if (generate)
            {
                if (format)
                    buffer.concat(",");
                else
                {
                    if (state.isFor)
                        buffer.concat(", ");
                    else
                    {
                        buffer.concat(",\n");
                        buffer.concat(indentation);
                        buffer.concat("        ");
                    }
                }
            }
        }

        state.vars[identifier] = {type: "var", node: decl.id};
        compileNode(decl.id, state, "IdentifierName");

        if (decl.init)
        {
            if (generate)
            {
                if (format)
                {
                    buffer.concatFormat(format.beforeEqual);
                    buffer.concat("=");
                    buffer.concatFormat(format.afterEqual);
                }
                else
                    buffer.concat(" = ");
            }

            compileNode(decl.init, state, "Expression");
        }

        // FIXME: Extract to function
        // Here we check back if a ivar with the same name exists and if we have prefixed 'self.' on previous uses.
        // If this is the case we have to remove the prefixes and issue a warning that the variable hides the ivar.
        if (state.addedSelfToIvars)
        {
            var addedSelfToIvar = state.addedSelfToIvars[identifier];

            if (addedSelfToIvar)
            {
                var atoms = state.compiler.jsBuffer.atoms,
                    size = addedSelfToIvar.length;

                for (i = 0; i < size; i++)
                {
                    var dict = addedSelfToIvar[i];
                    atoms[dict.index] = "";
                    compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", dict.node, compiler.source));
                }

                state.addedSelfToIvars[identifier] = [];
            }
        }
    }

    if (generate && !format && !state.isFor)
        buffer.concat(";\n"); // Don't add ';' if this is a for statement but do it if this is a statement
},

ThisExpression: function(node, state)
{
    var compiler = state.compiler;

    if (compiler.generate)
        compiler.jsBuffer.concat("this", node);
},

ArrayExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

        if (generate)
        {
            buffer = compiler.jsBuffer;
            buffer.concat("[", node);
        }

        for (var i = 0; i < node.elements.length; ++i)
        {
            var elt = node.elements[i];

            if (generate && i !== 0)
            {
                if (format)
                {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                }
                else
                    buffer.concat(", ");
            }

            if (elt)
                compileNode(elt, state, "Expression");
        }

        if (generate)
            buffer.concat("]");
},

ObjectExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        properties = node.properties,
        buffer = compiler.jsBuffer;

    if (generate)
        buffer.concat("{", node);

    for (var i = 0, size = properties.length; i < size; ++i)
    {
        var prop = properties[i];

        if (generate)
        {
            if (i)
            {
                if (format) {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                } else
                    buffer.concat(", ");
            }

            state.isPropertyKey = true;
            compileNode(prop.key, state, "Expression");
            delete state.isPropertyKey;

            if (format)
            {
                buffer.concatFormat(format.beforeColon);
                buffer.concat(":");
                buffer.concatFormat(format.afterColon);
            }
            else
                buffer.concat(": ");
        }
        else if (prop.key.raw && prop.key.raw.charAt(0) === "@")
        {
            buffer.concat(compiler.source.substring(compiler.lastPos, prop.key.start));
            compiler.lastPos = prop.key.start + 1;
        }

        compileNode(prop.value, state, "Expression");
    }

    if (generate)
        buffer.concat("}");
},

SequenceExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;
        buffer.concat("(");
    }

    for (var i = 0; i < node.expressions.length; ++i)
    {
        if (generate && i !== 0)
        {
            if (format)
            {
                buffer.concatFormat(format.beforeComma);
                buffer.concat(",");
                buffer.concatFormat(format.afterComma);
            }
            else
                buffer.concat(", ");
        }

        compileNode(node.expressions[i], state, "Expression");
    }

    if (generate)
        buffer.concat(")");
},

UnaryExpression: function(node, state, compileNode)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        argument = node.argument;

    if (generate)
    {
        var buffer = compiler.jsBuffer;

        if (node.prefix)
        {
            buffer.concat(node.operator, node);

            if (wordPrefixOperators(node.operator))
                buffer.concat(" ");

            parenthesizeExpression(generate, node, argument, state, compileNode);
        }
        else
        {
            parenthesizeExpression(generate, node, argument, state, compileNode);
            buffer.concat(node.operator);
        }
    }
    else
        compileNode(argument, state, "Expression");
},

UpdateExpression: function(node, state, compileNode)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer;

    if (node.argument.type === "Dereference")
    {
        checkCanDereference(state, node.argument);

        // @deref(x)++ and ++@deref(x) require special handling.
        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // Output the dereference function, "(...)(z)"
        buffer.concat((node.prefix ? "" : "(") + "(");

        // The thing being dereferenced.
        if (!generate)
            compiler.lastPos = node.argument.expr.start;

        compileNode(node.argument.expr, state, "Expression");

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.expr.end));

        buffer.concat(")(");

        if (!generate)
            compiler.lastPos = node.argument.start;

        compileNode(node.argument, state, "Expression");

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.end));

        buffer.concat(" " + node.operator.substring(0, 1) + " 1)" + (node.prefix ? "" : node.operator === "++" ? " - 1)" : " + 1)"));

        if (!generate)
            compiler.lastPos = node.end;

        return;
    }

    if (node.prefix)
    {
        if (generate)
        {
            buffer.concat(node.operator, node);

            if (wordPrefixOperators(node.operator))
                buffer.concat(" ");
        }

        parenthesizeExpression(generate, node, node.argument, state, compileNode);
    }
    else
    {
        parenthesizeExpression(generate, node, node.argument, state, compileNode);

        if (generate)
            buffer.concat(node.operator);
    }
},

BinaryExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate;

    parenthesizeExpression(generate, node, node.left, state, compileNode);

    if (generate)
    {
        var buffer = compiler.jsBuffer;
        buffer.concatFormat(format ? format.beforeOperator : " ");
        buffer.concat(node.operator);
        buffer.concatFormat(format ? format.afterOperator : " ");
    }

    parenthesizeExpression(generate, node, node.right, state, compileNode, true);
},

LogicalExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate;

    parenthesizeExpression(generate, node, node.left, state, compileNode);

    if (generate)
    {
        var buffer = compiler.jsBuffer;
        buffer.concatFormat(format ? format.beforeOperator : " ");
        buffer.concat(node.operator);
        buffer.concatFormat(format ? format.afterOperator : " ");
    }

    parenthesizeExpression(generate, node, node.right, state, compileNode, true);
},

AssignmentExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer;

    if (node.left.type === "Dereference")
    {
        checkCanDereference(state, node.left);

        // @deref(x) = z -> x(z) etc
        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // Output the dereference function, "(...)(z)"
        buffer.concat("(");

        // What's being dereferenced could itself be an expression, such as when dereferencing a deref.
        if (!generate)
            compiler.lastPos = node.left.expr.start;

        compileNode(node.left.expr, state, "Expression");

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.left.expr.end));

        buffer.concat(")(");

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator !== "=")
        {
            // Output the whole .left, not just .left.expr.
            if (!generate)
                compiler.lastPos = node.left.start;

            compileNode(node.left, state, "Expression");

            if (!generate)
                buffer.concat(compiler.source.substring(compiler.lastPos, node.left.end));

            buffer.concat(" " + node.operator.substring(0, 1) + " ");
        }

        if (!generate)
            compiler.lastPos = node.right.start;

        compileNode(node.right, state, "Expression");

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.right.end));

        buffer.concat(")");

        if (!generate)
            compiler.lastPos = node.end;
    }
    else
    {
        var saveAssignment = state.assignment;
        state.assignment = true;
        parenthesizeExpression(generate, node, node.left, state, compileNode);

        if (generate)
        {
            buffer.concatFormat(format ? format.beforeOperator : " ");
            buffer.concat(node.operator);
            buffer.concatFormat(format ? format.afterOperator : " ");
        }

        state.assignment = saveAssignment;
        parenthesizeExpression(generate, node, node.right, state, compileNode, true);

        if (state.isRootScope() && node.left.type === "Identifier" && !state.getLvar(node.left.name))
            state.vars[node.left.name] = {type: "global", node: node.left};
    }
},

ConditionalExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer;

    parenthesizeExpression(generate, node, node.test, state, compileNode);

    if (generate)
    {
        buffer = compiler.jsBuffer;

        if (format)
        {
            buffer.concatFormat(format.beforeOperator);
            buffer.concat("?");
            buffer.concatFormat(format.afterOperator);
        }
        else
            buffer.concat(" ? ");
    }

    compileNode(node.consequent, state, "Expression");

    if (generate)
    {
        if (format)
        {
            buffer.concatFormat(format.beforeOperator);
            buffer.concat(":");
            buffer.concatFormat(format.afterOperator);
        }
        else
            buffer.concat(" : ");
    }

    compileNode(node.alternate, state, "Expression");
},

NewExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        nodeArguments = node.arguments,
        generate = compiler.generate,
        buffer;

    if (generate)
    {
        buffer = compiler.jsBuffer;
        buffer.concat("new ", node);
    }

    parenthesizeExpression(generate, node, node.callee, state, compileNode);

    if (generate)
        buffer.concat("(");

    if (nodeArguments)
    {
        for (var i = 0, size = nodeArguments.length; i < size; ++i)
        {
            if (i > 0 && generate)
                buffer.concatFormat(format ? "," : ", ");

            compileNode(nodeArguments[i], state, "Expression");
        }
    }

    if (generate)
        buffer.concat(")");
},

CallExpression: function(node, state, compileNode, format)
{
    var compiler = state.compiler,
        nodeArguments = node.arguments,
        generate = compiler.generate,
        buffer;

    parenthesizeExpression(generate, node, node.callee, state, compileNode);

    if (generate)
    {
        buffer = compiler.jsBuffer;
        buffer.concat("(");
    }

    if (nodeArguments)
    {
        for (var i = 0, size = nodeArguments.length; i < size; ++i)
        {
            if (i > 0 && generate)
                buffer.concat(format ? "," : ", ");

            compileNode(nodeArguments[i], state, "Expression");
        }
    }

    if (generate)
        buffer.concat(")");
},

MemberExpression: function(node, state, compileNode)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        computed = node.computed;

    parenthesizeExpression(generate, node, node.object, state, compileNode);

    if (generate)
        compiler.jsBuffer.concat(computed ? "[" : ".", node);

    state.secondMemberExpression = !computed;

    // No parentheses when it is computed, '[' amd ']' are the same thing.
    parenthesizeExpression(generate && !computed, node, node.property, state, compileNode);
    state.secondMemberExpression = false;

    if (generate && computed)
      compiler.jsBuffer.concat("]");
},

Identifier: function(node, state)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        identifier = node.name;

    if (state.currentMethodType() === "-" && !state.secondMemberExpression && !state.isPropertyKey)
    {
        var lvar = state.getLvar(identifier, true), // Only look inside method
            ivar = compiler.getIvarForClass(identifier, state);

        if (ivar)
        {
            if (lvar)
                compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source));
            else
            {
                var nodeStart = node.start;

                if (!generate)
                {
                    do
                    {
                        // The Spider Monkey AST tree includes any parentheses in start and end properties
                        // so we have to make sure we skip those
                        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, nodeStart));
                        compiler.lastPos = nodeStart;
                    }
                    while (compiler.source.substr(nodeStart++, 1) === "(");
                }

                // Save the index of where the "self." string is stored and the node.
                // These will be used if we find a variable declaration that is hoisting this identifier.
                ((state.addedSelfToIvars || (state.addedSelfToIvars = Object.create(null)))[identifier] || (state.addedSelfToIvars[identifier] = [])).push({node: node, index: compiler.jsBuffer.length()});
                compiler.jsBuffer.concat("self.", node);
            }
        }
        // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
        else if (!reservedIdentifiers(identifier))
        {
            var message,
                classOrGlobal = typeof global[identifier] !== "undefined" || (typeof window !== "undefined" && typeof window[identifier] !== "undefined") || compiler.getClassDef(identifier),
                globalVar = state.getLvar(identifier);

            // It can't be declared with a @class statement
            if (classOrGlobal && (!globalVar || globalVar.type !== "class"))
            {
                /* jshint -W035 */
                /* Turned off this warning as there are many many warnings when compiling the Cappuccino frameworks - Martin
                if (lvar) {
                    message = compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides global variable", node, compiler.source));
                }*/
            }
            else if (!globalVar)
            {
                if (state.assignment)
                {
                    message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source);
                    // Turn off these warnings for this identifier, we only want one.
                    state.vars[identifier] = {type: "remove global warning", node: node};
                }
                else
                {
                    message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source);
                }
            }

            if (message)
                state.addMaybeWarning(message);
        }
    }

    if (generate)
        compiler.jsBuffer.concat(identifier, node);
},

// Use this when there should not be a look up to issue warnings or add 'self.' before ivars
IdentifierName: function(node, state)
{
    var compiler = state.compiler;

    if (compiler.generate)
        compiler.jsBuffer.concat(node.name, node);
},

Literal: function(node, state)
{
    var compiler = state.compiler,
        generate = compiler.generate;

    if (generate)
    {
        if (node.raw && node.raw.charAt(0) === "@")
            compiler.jsBuffer.concat(node.raw.substring(1), node);
        else
            compiler.jsBuffer.concat(node.raw, node);
    }
    else if (node.raw.charAt(0) === "@")
    {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start + 1;
    }
},

ArrayLiteral: function(node, state, compileNode)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        generateObjJ = compiler.options.generateObjJ,
        elementLength = node.elements.length;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
    }

    // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    if (!generate)
        buffer.concat(" ");

    if (generateObjJ)
        buffer.concat("@[");
    else if (!elementLength)
        buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"init\")", node);
    else
        buffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"initWithObjects:count:\", [", node);

    if (elementLength)
    {
        for (var i = 0; i < elementLength; i++)
        {
            var elt = node.elements[i];

            if (i)
                buffer.concat(", ");

            if (!generate)
                compiler.lastPos = elt.start;

            compileNode(elt, state, "Expression");

            if (!generate)
                buffer.concat(compiler.source.substring(compiler.lastPos, elt.end));
        }

        if (!generateObjJ)
            buffer.concat("], " + elementLength + ")");
    }

    if (generateObjJ)
        buffer.concat("]");

    if (!generate)
        compiler.lastPos = node.end;
},

DictionaryLiteral: function(node, state, compileNode)
{
    /* jshint -W004 */
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        generateObjJ = compiler.options.generateObjJ,
        keyLength = node.keys.length;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
    }

    // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    if (!generate)
        buffer.concat(" ");

    if (generateObjJ)
    {
        buffer.concat("@{");

        for (var i = 0; i < keyLength; i++)
        {
            if (i !== 0)
                buffer.concat(",");

            compileNode(node.keys[i], state, "Expression");
            buffer.concat(":");
            compileNode(node.values[i], state, "Expression");
        }

        buffer.concat("}");
    }
    else if (!keyLength)
    {
        buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"init\")", node);
    }
    else
    {
        buffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"initWithObjectsAndKeys:\"", node);

        for (var i = 0; i < keyLength; i++)
        {
            var key = node.keys[i],
                value = node.values[i];

            buffer.concat(", ");

            if (!generate)
                compiler.lastPos = value.start;

            compileNode(value, state, "Expression");

            if (!generate)
                buffer.concat(compiler.source.substring(compiler.lastPos, value.end));

            buffer.concat(", ");

            if (!generate)
                compiler.lastPos = key.start;

            compileNode(key, state, "Expression");

            if (!generate)
                buffer.concat(compiler.source.substring(compiler.lastPos, key.end));
        }

        buffer.concat(")");
    }

    if (!generate)
        compiler.lastPos = node.end;
},

ImportStatement: function(node, state)
{
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        isLocal = node.isLocal,
        generateObjJ = compiler.options.generateObjJ;

    if (!generate)
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    if (generateObjJ)
    {
        buffer.concat("@import ");
        buffer.concat(isLocal ? "\"" : "<");
        buffer.concat(node.filename.value);
        buffer.concat(isLocal ? "\"" : ">");
    }
    else
    {
        buffer.concat("objj_executeFile(\"", node);
        buffer.concat(node.filename.value);
        buffer.concat(isLocal ? "\", YES);" : "\", NO);");
    }

    if (!generate)
        compiler.lastPos = node.end;
},

ClassDeclarationStatement: function(node, state, compileNode)
{
    /* jshint -W004 */
    var compiler = state.compiler,
        generate = compiler.generate,
        saveJSBuffer = compiler.jsBuffer,
        className = node.classname.name,
        classDef = compiler.getClassDef(className),
        classScope = new Scope(state),
        isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
        protocols = node.protocols,
        generateObjJ = compiler.options.generateObjJ;

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
    // TODO: Check if this is needed
    compiler.classBodyBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);

    if (!generate)
        saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    // First we declare the class
    if (node.superclassname)
    {
        // To be an @implementation declaration it must have method and ivar dictionaries.
        // If there are neither, it's a @class declaration. If there is no ivar dictionary,
        // it's an @interface declaration.
        // TODO: Create a ClassDef object and add this logic to it
        if (classDef && classDef.ivars)
            // It has a real implementation declaration already
            throw compiler.syntaxError("Duplicate class " + className, node.classname);

        if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods)
            // It has a interface declaration already
            throw compiler.syntaxError("Duplicate interface definition for class " + className, node.classname);

        var superClassDef = compiler.getClassDef(node.superclassname.name);

        if (!superClassDef)
        {
            var errorMessage = "Can't find superclass " + node.superclassname.name;

            for (var i = Compiler.importStack.length; --i >= 0;)
                errorMessage += "\n" + new Array((Compiler.importStack.length - i) * 2 + 1).join(" ") + "Imported by: " + Compiler.importStack[i];

            throw compiler.syntaxError(errorMessage, node.superclassname);
        }

        classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null));

        if (!generateObjJ)
            saveJSBuffer.concat("{var the_class = objj_allocateClassPair(" + node.superclassname.name + ", \"" + className + "\"),\nmeta_class = the_class.isa;", node);
    }
    else if (node.categoryname)
    {
        classDef = compiler.getClassDef(className);

        if (!classDef)
            throw compiler.syntaxError("Class " + className + " not found ", node.classname);

        if (!generateObjJ)
        {
            saveJSBuffer.concat("{\nvar the_class = objj_getClass(\"" + className + "\")\n", node);
            saveJSBuffer.concat("if (!the_class) throw new SyntaxError(\"*** Could not find definition for class \\\"" + className + "\\\"\");\n");
            saveJSBuffer.concat("var meta_class = the_class.isa;");
        }
    }
    else
    {
        classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));

        if (!generateObjJ)
            saveJSBuffer.concat("{var the_class = objj_allocateClassPair(Nil, \"" + className + "\"),\nmeta_class = the_class.isa;", node);
    }

    if (generateObjJ)
    {
        saveJSBuffer.concat(isInterfaceDeclaration ? "@interface " : "@implementation ");
        saveJSBuffer.concat(className);

        if (node.superclassname)
        {
            saveJSBuffer.concat(" : ");
            compileNode(node.superclassname, state, "IdentifierName");
        }
        else if (node.categoryname)
        {
            saveJSBuffer.concat(" (");
            compileNode(node.categoryname, state, "IdentifierName");
            saveJSBuffer.concat(")");
        }
    }

    if (protocols)
    {
        for (var i = 0, size = protocols.length; i < size; i++)
        {
            if (generateObjJ) {
                if (i)
                    saveJSBuffer.concat(", ");
                else
                    saveJSBuffer.concat(" <");
                compileNode(protocols[i], state, "IdentifierName");
                if (i === size - 1)
                    saveJSBuffer.concat(">");
            } else {
                saveJSBuffer.concat("\nvar aProtocol = objj_getProtocol(\"" + protocols[i].name + "\");", protocols[i]);
                saveJSBuffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocols[i].name + "\\\"\");");
                saveJSBuffer.concat("\nclass_addProtocol(the_class, aProtocol);");
            }
        }
    }

/*
    if (isInterfaceDeclaration)
        classDef.interfaceDeclaration = true;
*/

    classScope.classDef = classDef;
    compiler.currentSuperClass = "objj_getClass(\"" + className + "\").super_class";
    compiler.currentSuperMetaClass = "objj_getMetaClass(\"" + className + "\").super_class";

    var firstIvarDeclaration = true,
        hasAccessors = false;

    // Now we add all ivars
    if (node.ivardeclarations)
    {
        if (generateObjJ)
        {
            saveJSBuffer.concat("{");
            indentation += indentStep;
        }

        for (var i = 0; i < node.ivardeclarations.length; ++i)
        {
            var ivarDecl = node.ivardeclarations[i],
                ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
                ivarIdentifier = ivarDecl.id,
                ivarName = ivarIdentifier.name,
                ivars = classDef.ivars,
                ivar = {"type": ivarType, "name": ivarName},
                accessors = ivarDecl.accessors;

            if (ivars[ivarName])
                throw compiler.syntaxError("Instance variable '" + ivarName + "'is already declared for class " + className, ivarIdentifier);

            if (generateObjJ)
                compileNode(ivarDecl, state, "IvarDeclaration");
            else
            {
                if (firstIvarDeclaration)
                {
                    firstIvarDeclaration = false;
                    saveJSBuffer.concat("class_addIvars(the_class, [");
                }
                else
                    saveJSBuffer.concat(", ");

                if (compiler.options.generateIvarTypeSignatures)
                    saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\", \"" + ivarType + "\")", node);
                else
                    saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\")", node);
            }

            if (ivarDecl.outlet)
                ivar.outlet = true;

            ivars[ivarName] = ivar;

            if (!classScope.ivars)
                classScope.ivars = Object.create(null);

            classScope.ivars[ivarName] = {type: "ivar", name: ivarName, node: ivarIdentifier, ivar: ivar};

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
                        var start = property.charAt(0) == '_' ? 1 : 0;

                        setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":";
                    }
                    classDef.addInstanceMethod(new MethodDef(setterName, ["void", ivarType]));
                }
                hasAccessors = true;
            }
        }
    }

    if (generateObjJ)
    {
        indentation = indentation.substring(indentSize);
        saveJSBuffer.concatFormat("\n}");
    }
    else if (!firstIvarDeclaration)
        saveJSBuffer.concat("]);");

    // If we have accessors add get and set methods for them
    if (!generateObjJ && !isInterfaceDeclaration && hasAccessors)
    {
        var getterSetterBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);

        // Add the class declaration to compile accessors correctly
        getterSetterBuffer.concat(compiler.source.substring(node.start, node.endOfIvars));
        getterSetterBuffer.concat("\n");

        for (var i = 0; i < node.ivardeclarations.length; ++i)
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
                setterName = (start ? "_" : "") + "set" + property.substr(start, 1).toUpperCase() + property.substring(start + 1) + ":";
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
            imBuffer = exports.compileToIMBuffer(source, "Accessors", this.options, compiler.classDefs, compiler.protocolDefs);

        // Add the accessor methods first to the instance method buffer.
        // This will allow manually added set and get methods to override the compiler generated methods.
        compiler.imBuffer.concat(imBuffer);
    }

    // We will store the classDef first after accessors are done so we don't get a duplicate class error
    compiler.classDefs[className] = classDef;

    var bodies = node.body,
        bodyLength = bodies.length;

    if (bodyLength > 0)
    {
        var body;

        if (!generate)
            compiler.lastPos = bodies[0].start;

        // And last add methods and other statements
        for (var i = 0; i < bodyLength; ++i)
        {
            body = bodies[i];
            compileNode(body, classScope, "Statement");
        }

        if (!generate)
            saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, body.end));
    }

    // We must make a new class object for our class definition if it's not a category
    if (!generateObjJ && !isInterfaceDeclaration && !node.categoryname)
        saveJSBuffer.concat("objj_registerClassPair(the_class);\n");

    // Add instance methods
    if (!generateObjJ && compiler.imBuffer.isEmpty())
    {
        saveJSBuffer.concat("class_addMethods(the_class, [");
        saveJSBuffer.appendStringBuffer(compiler.imBuffer);
        saveJSBuffer.concat("]);\n");
    }

    // Add class methods
    if (!generateObjJ && compiler.cmBuffer.isEmpty())
    {
        saveJSBuffer.concat("class_addMethods(meta_class, [");
        saveJSBuffer.appendStringBuffer(compiler.cmBuffer);
        saveJSBuffer.concat("]);\n");
    }

    if (!generateObjJ)
        saveJSBuffer.concat("}");

    compiler.jsBuffer = saveJSBuffer;

    // Skip the "@end"
    if (!generate)
        compiler.lastPos = node.end;

    if (generateObjJ)
        saveJSBuffer.concat("\n@end");

    // If the class conforms to protocols check that all required methods are implemented
    if (protocols)
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
    }
},

ProtocolDeclarationStatement: function(node, state, compileNode)
{
    /* jshint -W004 */
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        protocolName = node.protocolname.name,
        protocolDef = compiler.getProtocolDef(protocolName),
        protocols = node.protocols,
        protocolScope = new Scope(state),
        inheritFromProtocols = [],
        generateObjJ = compiler.options.generateObjJ;

    if (protocolDef)
        throw compiler.syntaxError("Duplicate protocol " + protocolName, node.protocolname);

    compiler.imBuffer = new StringBuffer();
    compiler.cmBuffer = new StringBuffer();

    if (!generate)
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    if (generateObjJ)
    {
        buffer.concat("@protocol ");
        compileNode(node.protocolname, state, "IdentifierName");
    }
    else
        buffer.concat("{var the_protocol = objj_allocateProtocol(\"" + protocolName + "\");", node);

    if (protocols)
    {
        if (generateObjJ)
            buffer.concat(" <");

        for (var i = 0, size = protocols.length; i < size; i++)
        {
            var protocol = protocols[i],
                inheritFromProtocolName = protocol.name,
                inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

            if (!inheritProtocolDef)
                throw compiler.syntaxError("Can't find protocol " + inheritFromProtocolName, protocol);

            if (generateObjJ)
            {
                if (i)
                    buffer.concat(", ");

                compileNode(protocol, state, "IdentifierName");
            }
            else
            {
                buffer.concat("\nvar aProtocol = objj_getProtocol(\"" + inheritFromProtocolName + "\");", node);
                buffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocolName + "\\\"\");", node);
                buffer.concat("\nprotocol_addProtocol(the_protocol, aProtocol);", node);
            }

            inheritFromProtocols.push(inheritProtocolDef);
        }

        if (generateObjJ)
            buffer.concat(">");
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
            for (var i = 0; i < requiredLength; ++i)
            {
                required = someRequired[i];

                if (!generate)
                    compiler.lastPos = required.start;

                compileNode(required, protocolScope, "Statement");
            }

            if (!generate)
                buffer.concat(compiler.source.substring(compiler.lastPos, required.end));
        }
    }

    if (generateObjJ)
        buffer.concatFormat("\n@end");
    else
    {
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
    }

    compiler.jsBuffer = buffer;

    // Skip @end
    if (!generate)
        compiler.lastPos = node.end;
},

IvarDeclaration: function(node, state, compileNode)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer;

    if (node.outlet)
        buffer.concat("@outlet ");

    compileNode(node.ivartype, state, "IdentifierName");
    buffer.concat(" ");
    compileNode(node.id, state, "IdentifierName");

    if (node.accessors)
        buffer.concat(" @accessors");
},

MethodDeclarationStatement: function(node, state, compileNode)
{
    /* jshint -W004 */
    var compiler = state.compiler,
        generate = compiler.generate,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new Scope(state),
        isInstanceMethodType = node.methodtype === "-",
        selectors = node.selectors,
        nodeArguments = node.arguments,
        returnType = node.returntype,
        // Return type is 'id' as default except if it is an action declared method, then it's 'void'
        types = [returnType ? returnType.name : (node.action ? "void" : "id")],
        returnTypeProtocols = returnType ? returnType.protocols : null,
        selector = selectors[0].name,    // There is always at least one selector
        generateObjJ = compiler.options.generateObjJ;

    if (returnTypeProtocols)
    {
        for (var i = 0, count = returnTypeProtocols.length; i < count; i++)
        {
            var returnTypeProtocol = returnTypeProtocols[i];

            if (!compiler.getProtocolDef(returnTypeProtocol.name))
                compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source));
        }
    }

    if (!generate)
        saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    // If we are generating objective-J code write everything directly to the regular buffer
    // Otherwise we have one for instance methods and one for class methods.
    if (generateObjJ)
    {
        compiler.jsBuffer.concat(isInstanceMethodType ? "- (" : "+ (");
        compiler.jsBuffer.concat(types[0]);
        compiler.jsBuffer.concat(")");
    }
    else
        compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;

    // Put together the selector. Maybe this should be done in the parser...
    // Or maybe we should do it here as when genereting Objective-J code it's kind of handy
    if (nodeArguments.length > 0)
    {
        for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i],
                argumentType = argument.type,
                argumentTypeName = argumentType ? argumentType.name : "id",
                argumentProtocols = argumentType ? argumentType.protocols : null;

            types.push(argumentTypeName);

            if (i === 0)
                selector += ":";
            else
                selector += (selectors[i] ? selectors[i].name : "") + ":";

            if (argumentProtocols)
            {
                for (var j = 0, size = argumentProtocols.length; j < size; j++)
                {
                    var argumentProtocol = argumentProtocols[j];

                    if (!compiler.getProtocolDef(argumentProtocol.name))
                        compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source));
                }
            }

            if (generateObjJ)
            {
                var aSelector = selectors[i];

                if (i)
                    compiler.jsBuffer.concat(" ");

                compiler.jsBuffer.concat((aSelector ? aSelector.name : "") + ":");
                compiler.jsBuffer.concat("(");
                compiler.jsBuffer.concat(argumentTypeName);

                if (argumentProtocols)
                {
                    compiler.jsBuffer.concat(" <");

                    for (var j = 0, size = argumentProtocols.length; j < size; j++)
                    {
                        var argumentProtocol = argumentProtocols[j];

                        if (j)
                            compiler.jsBuffer.concat(", ");

                        compiler.jsBuffer.concat(argumentProtocol.name);
                    }

                    compiler.jsBuffer.concat(">");
                }

                compiler.jsBuffer.concat(")");
                compileNode(argument.identifier, state, "IdentifierName");
            }
        }
    }
    else if (generateObjJ)
    {
        var selector = selectors[0];
        compiler.jsBuffer.concat(selector.name, selector);
    }

    if (generateObjJ)
    {
        if (node.parameters)
            compiler.jsBuffer.concat(", ...");
    }
    else
    {
        if (compiler.jsBuffer.isEmpty())           // Add comma separator if this is not first method in this buffer
            compiler.jsBuffer.concat(", ");

        compiler.jsBuffer.concat("new objj_method(sel_getUid(\"", node);
        compiler.jsBuffer.concat(selector);
        compiler.jsBuffer.concat("\"), ");
    }

    if (node.body)
    {
        if (!generateObjJ)
        {
            compiler.jsBuffer.concat("function");

            if (compiler.options.generateMethodFunctionNames)
                compiler.jsBuffer.concat(" $" + state.currentClassName() + "__" + selector.replace(/:/g, "_"));

            compiler.jsBuffer.concat("(self, _cmd");
        }

        methodScope.methodType = node.methodtype;

        if (nodeArguments)
        {
            for (var i = 0; i < nodeArguments.length; i++)
            {
                var argument = nodeArguments[i],
                    argumentName = argument.identifier.name;

                if (!generateObjJ)
                {
                    compiler.jsBuffer.concat(", ");
                    compiler.jsBuffer.concat(argumentName, argument.identifier);
                }

                methodScope.vars[argumentName] = {type: "method argument", node: argument};
            }
        }

        if (!generateObjJ)
            compiler.jsBuffer.concat(")\n");

        if (!generate)
            compiler.lastPos = node.startOfBody;

        indentation += indentStep;
        compileNode(node.body, methodScope, "Statement");
        indentation = indentation.substring(indentSize);

        if (!generate)
            compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.body.end));

        if (!generateObjJ)
            compiler.jsBuffer.concat("\n");
    }
    else  // It is a interface or protocol declaration and we don't have a method implementation
    {
        if (generateObjJ)
            compiler.jsBuffer.concat(";");
        else
            compiler.jsBuffer.concat("Nil\n");
    }

    if (!generateObjJ)
    {
        if (compiler.options.generateMethodArgumentTypeSignatures)
            compiler.jsBuffer.concat(","+JSON.stringify(types));

        compiler.jsBuffer.concat(")");
        compiler.jsBuffer = saveJSBuffer;
    }

    if (!generate)
        compiler.lastPos = node.end;

    // Add the method to the class or protocol definition
    var def = state.classDef,
        alreadyDeclared;

    // But first, if it is a class definition check if it is declared in the superclass or interface declaration
    if (def)
        alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
    else
        def = state.protocolDef;

    if (!def)
        throw "InternalError: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: " + exports.acorn.getLineInfo(compiler.source, node.start).line;

    // Create warnings if types do not correspond to the method declaration in the superclass or interface declarations.
    // If we don't find the method in the superclass or interface declarations above or if it is a protocol
    // declaration, try to find it in any of the conforming protocols.
    if (!alreadyDeclared)
    {
        var protocols = def.protocols;

        if (protocols)
        {
            for (var i = 0, size = protocols.length; i < size; i++)
            {
                var protocol = protocols[i],
                    alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

                if (alreadyDeclared)
                    break;
            }
        }
    }

    if (alreadyDeclared)
    {
        var declaredTypes = alreadyDeclared.types;

        if (declaredTypes)
        {
            var typeSize = declaredTypes.length;

            if (typeSize > 0)
            {
                // First type is return type
                var declaredReturnType = declaredTypes[0];

                // Create warning if return types are not the same. It is ok if superclass has 'id' and subclass has a class type.
                if (declaredReturnType !== types[0] && !(declaredReturnType === "id" && returnType && returnType.typeisclass))
                    compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + declaredReturnType + "' vs '" + types[0] + "'", returnType || node.action || selectors[0], compiler.source));

                // Check the parameter types. The size of the two type arrays should be the same as they have the same selector.
                for (var i = 1; i < typeSize; i++)
                {
                    var parameterType = declaredTypes[i];

                    if (parameterType !== types[i] && !(parameterType === "id" && nodeArguments[i - 1].type.typeisclass))
                        compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", nodeArguments[i - 1].type || nodeArguments[i - 1].identifier, compiler.source));
                }
            }
        }
    }

    // Now we add it
    var methodDef = new MethodDef(selector, types);

    if (isInstanceMethodType)
        def.addInstanceMethod(methodDef);
    else
        def.addClassMethod(methodDef);
},

MessageSendExpression: function(node, state, compileNode)
{
    /* jshint -W004 */
    var compiler = state.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        generateObjJ = compiler.options.generateObjJ;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.object ? node.object.start : node.arguments.length ? node.arguments[0].start : node.end;
    }

    if (node.superObject)
    {
        // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        if (!generate)
            buffer.concat(" ");

        if (generateObjJ)
            buffer.concat("[super ");
        else
        {
            buffer.concat("objj_msgSendSuper(", node);
            buffer.concat("{ receiver:self, super_class:" + (state.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass ) + " }");
        }
    }
    else
    {
        // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        if (!generate)
            buffer.concat(" ");

        if (generateObjJ)
            buffer.concat("[", node);
        else
            buffer.concat("objj_msgSend(", node);

        compileNode(node.object, state, "Expression");

        if (!generate)
            buffer.concat(compiler.source.substring(compiler.lastPos, node.object.end));
    }

    var selectors = node.selectors,
        nodeArguments = node.arguments,
        firstSelector = selectors[0],
        // There is always at least one selector
        selector = firstSelector ? firstSelector.name : "",
        parameters = node.parameters;

    if (generateObjJ)
    {
        for (var i = 0, size = nodeArguments.length; i < size || (size === 0 && i === 0); i++)
        {
            var sel = selectors[i];
            buffer.concat(" ");
            buffer.concat(sel ? sel.name : "");

            if (size > 0)
            {
                var argument = nodeArguments[i];
                buffer.concat(":");
                compileNode(argument, state, "Expression");
            }
        }

        if (parameters)
        {
            for (i = 0, size = parameters.length; i < size; ++i)
            {
                var parameter = parameters[i];
                buffer.concat(", ");
                compileNode(parameter, state, "Expression");
            }
        }

        buffer.concat("]");
    }
    else
    {
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
            for (i = 0; i < nodeArguments.length; i++)
            {
                var argument = nodeArguments[i];
                buffer.concat(", ");

                if (!generate)
                    compiler.lastPos = argument.start;

                compileNode(argument, state, "Expression");

                if (!generate)
                {
                    buffer.concat(compiler.source.substring(compiler.lastPos, argument.end));
                    compiler.lastPos = argument.end;
                }
            }
        }

        if (parameters)
        {
            for (i = 0; i < parameters.length; ++i)
            {
                var parameter = parameters[i];
                buffer.concat(", ");

                if (!generate)
                    compiler.lastPos = parameter.start;

                compileNode(parameter, state, "Expression");

                if (!generate)
                {
                    buffer.concat(compiler.source.substring(compiler.lastPos, parameter.end));
                    compiler.lastPos = parameter.end;
                }
            }
        }

        buffer.concat(")");
    }

    if (!generate)
        compiler.lastPos = node.end;
},

SelectorLiteralExpression: function(node, state)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate,
        generateObjJ = compiler.options.generateObjJ;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        // Add an extra space if it looks something like this: "return(@selector(a:))". No space between return and expression.
        buffer.concat(" ");
    }

    buffer.concat(generateObjJ ? "@selector(" : "sel_getUid(\"", node);
    buffer.concat(node.selector);
    buffer.concat(generateObjJ ?  ")" : "\")");

    if (!generate)
        compiler.lastPos = node.end;
},

ProtocolLiteralExpression: function(node, state, compileNode)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate,
        generateObjJ = compiler.options.generateObjJ;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(" "); // Add an extra space if it looks something like this: "return(@protocol(a))". No space between return and expression.
    }

    buffer.concat(generateObjJ ? "@protocol(" : "objj_getProtocol(\"", node);
    compileNode(node.id, state, "IdentifierName");
    buffer.concat(generateObjJ ?  ")" : "\")");

    if (!generate)
        compiler.lastPos = node.end;
},

Reference: function(node, state)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate,
        generateObjJ = compiler.options.generateObjJ;

    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    }

    if (generateObjJ)
    {
        buffer.concat("@ref(", node);
        buffer.concat(node.element.name, node.element);
        buffer.concat(")", node);
    }
    else
    {
        buffer.concat("function(__input) { if (arguments.length) return ", node);
        buffer.concat(node.element.name);
        buffer.concat(" = __input; return ");
        buffer.concat(node.element.name);
        buffer.concat("; }");
    }

    if (!generate)
        compiler.lastPos = node.end;
},

Dereference: function(node, state, compileNode)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate,
        generateObjJ = compiler.options.generateObjJ;

    checkCanDereference(state, node.expr);

    // @deref(y) -> y()
    // @deref(@deref(y)) -> y()()
    if (!generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.expr.start;
    }

    if (generateObjJ)
        buffer.concat("@deref(");

    compileNode(node.expr, state, "Expression");

    if (!generate)
        buffer.concat(compiler.source.substring(compiler.lastPos, node.expr.end));

    if (generateObjJ)
        buffer.concat(")");
    else
        buffer.concat("()");

    if (!generate)
        compiler.lastPos = node.end;
},

ClassStatement: function(node, state, compileNode)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generateObjJ = compiler.options.generateObjJ;

    if (!compiler.generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
        buffer.concat("//");
    }

    if (generateObjJ)
    {
        buffer.concat("@class ");
        compileNode(node.id, state, "IdentifierName");
    }

    var className = node.id.name;

    if (!compiler.getClassDef(className))
        compiler.classDefs[className] = new ClassDef(false, className);

    state.vars[node.id.name] = {type: "class", node: node.id};
},

GlobalStatement: function(node, state, compileNode)
{
    var compiler = state.compiler,
        buffer = compiler.jsBuffer,
        generateObjJ = compiler.options.generateObjJ;

    if (!compiler.generate)
    {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
        buffer.concat("//");
    }

    if (generateObjJ)
    {
        buffer.concat("@global ");
        compileNode(node.id, state, "IdentifierName");
    }

    state.rootScope().vars[node.id.name] = {type: "global", node: node.id};
},

PreprocessStatement: function(node, state)
{
    var compiler = state.compiler;

    if (!compiler.generate)
    {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
        compiler.jsBuffer.concat("//");
    }
}
});  // var codeGenerator = walk.make()

});  // function wrapper
