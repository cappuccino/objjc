// ObjJAcornCompiler was written by Martin Carlberg and released under
// an MIT license.
//
// Git repositories for ObjJAcornCompiler are available at
//
//     https://github.com/mrcarlberg/ObjJAcornCompiler.git
//
// Please use the [github bug tracker][ghbt] to report issues.
//
// [ghbt]: https://github.com/mrcarlberg/ObjJAcornCompiler/issues
//
// This file defines the main compiler interface.
//
// Copyright 2013, Martin Carlberg.

(function(mod)
{
    if (typeof exports == "object" && typeof module == "object")
        return mod(exports, require("objj-acorn/acorn"), require("objj-acorn/util/walk"), require("source-map")); // CommonJS
    if (typeof define == "function" && define.amd)
        return define(["exports", "objj-acorn/acorn", "objj-acorn/util/walk", "source-map"], mod); // AMD
    mod(this.objjCompiler || (this.objjCompiler = {}), acorn, acorn.walk, sourceMap); // Plain browser env
})(function(exports, acorn, walk, sourceMap)
{
"use strict";

exports.version = "0.3.0";
exports.acorn = acorn;

var Scope = function(prev, base)
{
    this.vars = Object.create(null);

    if (base) for (var key in base) this[key] = base[key];
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
}

Scope.prototype.toString = function()
{
    return this.ivars ? "ivars: " + JSON.stringify(this.ivars) : "<No ivars>";
}

Scope.prototype.compiler = function()
{
    return this.compiler;
}

Scope.prototype.rootScope = function()
{
    return this.prev ? this.prev.rootScope() : this;
}

Scope.prototype.isRootScope = function()
{
    return !this.prev;
}

Scope.prototype.currentClassName = function()
{
    return this.classDef ? this.classDef.name : this.prev ? this.prev.currentClassName() : null;
}

Scope.prototype.currentProtocolName = function()
{
    return this.protocolDef ? this.protocolDef.name : this.prev ? this.prev.currentProtocolName() : null;
}

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
}

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
}

Scope.prototype.currentMethodType = function()
{
    return this.methodType ? this.methodType : this.prev ? this.prev.currentMethodType() : null;
}

Scope.prototype.copyAddedSelfToIvarsToParent = function()
{
  if (this.prev && this.addedSelfToIvars) for (var key in this.addedSelfToIvars)
  {
    var addedSelfToIvar = this.addedSelfToIvars[key],
        scopeAddedSelfToIvar = (this.prev.addedSelfToIvars || (this.prev.addedSelfToIvars = Object.create(null)))[key] || (this.prev.addedSelfToIvars[key] = []);

    scopeAddedSelfToIvar.push.apply(scopeAddedSelfToIvar, addedSelfToIvar);   // Append at end in parent scope
  }
}

Scope.prototype.addMaybeWarning = function(warning)
{
    var rootScope = this.rootScope();

    (rootScope._maybeWarnings || (rootScope._maybeWarnings = [])).push(warning);
}

Scope.prototype.maybeWarnings = function()
{
    return this.rootScope()._maybeWarnings;
}

Scope.prototype.pushNode = function(node, overrideType)
{
    // Here we push 3 things to a stack. The node, override type and an array that can keep track of prior nodes on this level.
    // The current node is also pushed to the last prior array.
    // Special case when node is the same as the parent node. This happends when using an override type when walking the AST
    // The same prior list is then used instead of a new empty one.
    var nodePriorStack = this.nodePriorStack,
        length = nodePriorStack.length,
        lastPriorList = length ? nodePriorStack[length - 1] : null,
        lastNode = length ? this.nodeStack[length - 1] : null;
    // First add this node to parent list of nodes, if it has one
    if (lastPriorList) {
        if (lastNode !== node) {
            // If not the same node push the node
            lastPriorList.push(node);
        }
    }
    // Use the last prior list if it is the same node
    nodePriorStack.push(lastNode === node ? lastPriorList : []);
    this.nodeStack.push(node);
    this.nodeStackOverrideType.push(overrideType);
}

Scope.prototype.popNode = function()
{
    this.nodeStackOverrideType.pop();
    this.nodePriorStack.pop();
    return this.nodeStack.pop();
}

Scope.prototype.currentNode = function()
{
    var nodeStack = this.nodeStack;
    return nodeStack[nodeStack.length - 1];
}

Scope.prototype.currentOverrideType = function()
{
    var nodeStackOverrideType = this.nodeStackOverrideType;
    return nodeStackOverrideType[nodeStackOverrideType.length - 1];
}

Scope.prototype.priorNode = function()
{
    var nodePriorStack = this.nodePriorStack,
        length = nodePriorStack.length;

    if (length > 1) {
        var parent = nodePriorStack[length - 2],
            l = parent.length;
        return parent[l - 2] || null;
    }
    return null;
}

Scope.prototype.formatDescription = function(index, formatDescription, useOverrideForNode)
{
    var nodeStack = this.nodeStack,
        length = nodeStack.length;

    index = index || 0;
    if (index >= length)
        return null;

    // Get the nodes backwards from the stack
    var i = length - index - 1;
    var currentNode = nodeStack[i];
    var currentFormatDescription = formatDescription || this.compiler.formatDescription;
    // Get the parent descriptions except if no formatDescription was provided, then it is the root description
    var parentFormatDescriptions = formatDescription ? formatDescription.parent : currentFormatDescription;

    var nextFormatDescription;
    if (parentFormatDescriptions) {
        var nodeType = useOverrideForNode === currentNode ? this.nodeStackOverrideType[i] : currentNode.type;
        //console.log("nodeType: " + nodeType + ", (useOverrideForNode === currentNode):" +  + !!(useOverrideForNode === currentNode));
        nextFormatDescription = parentFormatDescriptions[nodeType];
        if (useOverrideForNode === currentNode && !nextFormatDescription) {
            //console.log("Stop");
            return null;
        }
    }

    //console.log("index: " + index + ", currentNode: " + JSON.stringify(currentNode) + ", currentFormatDescription: " + JSON.stringify(currentFormatDescription) + ", nextFormatDescription: " + JSON.stringify(nextFormatDescription));        

    if (nextFormatDescription) {
        // Check for more 'parent' attributes or return nextFormatDescription
        return this.formatDescription(index + 1, nextFormatDescription);
    } else {
        // Check for a virtual node one step up in the stack
        nextFormatDescription = this.formatDescription(index + 1, formatDescription, currentNode);
        if (nextFormatDescription)
            return nextFormatDescription;
        else {
            // Ok, we have found a format description (currentFormatDescription).
            // Lets check if we have any other descriptions dependent on the prior node.
            var priorFormatDescriptions = currentFormatDescription.prior;
            if (priorFormatDescriptions) {
                var priorNode = this.priorNode(),
                    priorFormatDescription = priorFormatDescriptions[priorNode ? priorNode.type : "None"];
                if (priorFormatDescription)
                    return priorFormatDescription;
            }
            return currentFormatDescription;
        }
    }
}

var GlobalVariableMaybeWarning = function(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code)
{
    this.message = createMessage(aMessage, node, code);
    this.node = node;
}

GlobalVariableMaybeWarning.prototype.checkIfWarning = function(/* Scope */ st)
{
    var identifier = this.node.name;
    return !st.getLvar(identifier) && typeof global[identifier] === "undefined" && (typeof window === 'undefined' || typeof window[identifier] === "undefined") && !st.compiler.getClassDef(identifier);
}

function StringBuffer(useSourceNode, file)
{
    if (useSourceNode) {
        this.rootNode = new sourceMap.SourceNode();
        this.concat = this.concatSourceNode;
        this.toString = this.toStringSourceNode;
        this.isEmpty = this.isEmptySourceNode;
        this.appendStringBuffer = this.appendStringBufferSourceNode;
        this.length = this.lengthSourceNode;
        this.file = file;
    } else {
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
}

StringBuffer.prototype.toStringSourceNode = function()
{
    return this.rootNode.toStringWithSourceMap({file: this.file});
}

StringBuffer.prototype.concatString = function(aString)
{
    this.atoms.push(aString);
}

StringBuffer.prototype.concatSourceNode = function(aString, node)
{
    if (node) {
        //console.log("Snippet: " + aString + ", line: " + node.loc.start.line + ", column: " + node.loc.start.column + ", source: " + node.loc.source);
        this.rootNode.add(new sourceMap.SourceNode(node.loc.start.line, node.loc.start.column, node.loc.source, aString));
    } else
        this.rootNode.add(aString);
    if (this.notEmpty)
        this.notEmpty = true;
}

// '\n' will indent. '\n\0' will not indent. '\n\1' will indent one more then the current indent level.
// '\n\-1' will indent one less then the current indent level. Numbers from 0-9 can me used.
StringBuffer.prototype.concatFormat = function(aString)
{
    if (!aString) return;
    var lines = aString.split("\n"),
        size = lines.length;
    if (size > 1) {
        this.concat(lines[0]);
        for (var i = 1; i < size; i++) {
            var line = lines[i];
            this.concat("\n");
            if (line.slice(0, 1) === "\\") {
                var numberLength = 1;
                var indent = line.slice(1, 1 + numberLength);
                if (indent === '-') {
                    numberLength = 2;
                    indent = line.slice(1, 1 + numberLength);
                }
                var indentationNumber = parseInt(indent);
                if (indentationNumber) {
                    this.concat(indentationNumber > 0 ? indentation + Array(indentationNumber * indentationSpaces + 1).join(indentType) : indentation.substring(indentationSize * -indentationNumber));
                }
                line = line.slice(1 + numberLength);
            } else if (line || i === size - 1) {
                // Ident if there is something between line breaks or the last linebreak
                this.concat(indentation);
            }
            if (line) this.concat(line);
        }
    } else
        this.concat(aString);
}

StringBuffer.prototype.isEmptyString = function()
{
    return this.atoms.length !== 0;
}

StringBuffer.prototype.isEmptySourceNode = function()
{
    return !this.notEmpty;
}

StringBuffer.prototype.appendStringBufferString = function(stringBuffer)
{
    this.atoms.push.apply(this.atoms, stringBuffer.atoms);
}

StringBuffer.prototype.appendStringBufferSourceNode = function(stringBuffer)
{
    this.rootNode.add(stringBuffer.rootNode);
}

StringBuffer.prototype.lengthString = function()
{
    return this.atoms.length;
}

StringBuffer.prototype.lengthSourceNode = function()
{
    return this.rootNode.children.length;
}

// Both the ClassDef and ProtocolDef conforms to a 'protocol' (That we can't declare in Javascript).
// Both Objects have the attribute 'protocols': Array of ProtocolDef that they conform to
// Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
// classDef = {"className": aClassName, "superClass": superClass , "ivars": myIvars, "instanceMethods": instanceMethodDefs, "classMethods": classMethodDefs, "protocols": myProtocols};
var ClassDef = function(isImplementationDeclaration, name, superClass, ivars, instanceMethods, classMethods, protocols)
{
    this.name = name;
    if (superClass)
        this.superClass = superClass;
    if (ivars)
        this.ivars = ivars;
    if (isImplementationDeclaration) {
        this.instanceMethods = instanceMethods || Object.create(null);
        this.classMethods = classMethods || Object.create(null);
    }
    if (protocols)
        this.protocols = protocols;
}

ClassDef.prototype.addInstanceMethod = function(methodDef) {
    this.instanceMethods[methodDef.name] = methodDef;
}

ClassDef.prototype.addClassMethod = function(methodDef) {
    this.classMethods[methodDef.name] = methodDef;
}

ClassDef.prototype.listOfNotImplementedMethodsForProtocols = function(protocolDefs) {
    var resultList = [],
        instanceMethods = this.getInstanceMethods(),
        classMethods = this.getClassMethods();

    for (var i = 0, size = protocolDefs.length; i < size; i++)
    {
        var protocolDef = protocolDefs[i],
            protocolInstanceMethods = protocolDef.requiredInstanceMethods,
            protocolClassMethods = protocolDef.requiredClassMethods,
            inheritFromProtocols = protocolDef.protocols;

        if (protocolInstanceMethods) for (var methodName in protocolInstanceMethods) {
            var methodDef = protocolInstanceMethods[methodName];

            if (!instanceMethods[methodName])
                resultList.push({"methodDef": methodDef, "protocolDef": protocolDef});
        }

        if (protocolClassMethods) for (var methodName in protocolClassMethods) {
            var methodDef = protocolClassMethods[methodName];

            if (!classMethods[methodName])
                resultList.push({"methodDef": methodDef, "protocolDef": protocolDef});
        }

        if (inheritFromProtocols)
            resultList = resultList.concat(this.listOfNotImplementedMethodsForProtocols(inheritFromProtocols));
    }

    return resultList;
}

ClassDef.prototype.getInstanceMethod = function(name) {
    var instanceMethods = this.instanceMethods;

    if (instanceMethods) {
        var method = instanceMethods[name];

        if (method)
            return method;
    }

    var superClass = this.superClass;

    if (superClass)
        return superClass.getInstanceMethod(name);

    return null;
}

ClassDef.prototype.getClassMethod = function(name) {
    var classMethods = this.classMethods;
    if (classMethods) {
        var method = classMethods[name];

        if (method)
            return method;
    }

    var superClass = this.superClass;

    if (superClass)
        return superClass.getClassMethod(name);

    return null;
}

// Return a new Array with all instance methods
ClassDef.prototype.getInstanceMethods = function() {
    var instanceMethods = this.instanceMethods;
    if (instanceMethods) {
        var superClass = this.superClass,
            returnObject = Object.create(null);
        if (superClass) {
            var superClassMethods = superClass.getInstanceMethods();
            for (var methodName in superClassMethods)
                returnObject[methodName] = superClassMethods[methodName];
        }

        for (var methodName in instanceMethods)
            returnObject[methodName] = instanceMethods[methodName];

        return returnObject;
    }

    return [];
}

// Return a new Array with all class methods
ClassDef.prototype.getClassMethods = function() {
    var classMethods = this.classMethods;
    if (classMethods) {
        var superClass = this.superClass,
            returnObject = Object.create(null);
        if (superClass) {
            var superClassMethods = superClass.getClassMethods();
            for (var methodName in superClassMethods)
                returnObject[methodName] = superClassMethods[methodName];
        }

        for (var methodName in classMethods)
            returnObject[methodName] = classMethods[methodName];

        return returnObject;
    }

    return [];
}

//  protocolDef = {"name": aProtocolName, "protocols": inheritFromProtocols, "requiredInstanceMethods": requiredInstanceMethodDefs, "requiredClassMethods": requiredClassMethodDefs};
var ProtocolDef = function(name, protocols, requiredInstanceMethodDefs, requiredClassMethodDefs)
{
    this.name = name;
    this.protocols = protocols;
    if (requiredInstanceMethodDefs)
        this.requiredInstanceMethods = requiredInstanceMethodDefs;
    if (requiredClassMethodDefs)
        this.requiredClassMethods = requiredClassMethodDefs;
}

ProtocolDef.prototype.addInstanceMethod = function(methodDef) {
    (this.requiredInstanceMethods || (this.requiredInstanceMethods = Object.create(null)))[methodDef.name] = methodDef;
}

ProtocolDef.prototype.addClassMethod = function(methodDef) {
    (this.requiredClassMethods || (this.requiredClassMethods = Object.create(null)))[methodDef.name] = methodDef;
}

ProtocolDef.prototype.getInstanceMethod = function(name) {
    var instanceMethods = this.requiredInstanceMethods;

    if (instanceMethods) {
        var method = instanceMethods[name];

        if (method)
            return method;
    }

    var protocols = this.protocols;

    for (var i = 0, size = protocols.length; i < size; i++) {
        var protocol = protocols[i],
            method = protocol.getInstanceMethod(name);

        if (method)
            return method;
    }

    return null;
}

ProtocolDef.prototype.getClassMethod = function(name) {
    var classMethods = this.requiredClassMethods;

    if (classMethods) {
        var method = classMethods[name];

        if (method)
            return method;
    }

    var protocols = this.protocols;

    for (var i = 0, size = protocols.length; i < size; i++) {
        var protocol = protocols[i],
            method = protocol.getInstanceMethod(name);

        if (method)
            return method;
    }

    return null;
}

// methodDef = {"types": types, "name": selector}
var MethodDef = function(name, types)
{
    this.name = name;
    this.types = types;
}

var reservedIdentifiers = acorn.makePredicate("self _cmd undefined localStorage arguments");

var wordPrefixOperators = acorn.makePredicate("delete in instanceof new typeof void");

var isLogicalBinary = acorn.makePredicate("LogicalExpression BinaryExpression");
var isInInstanceof = acorn.makePredicate("in instanceof");

  // A optional argument can be given to further configure
  // the compiler. These options are recognized:

  var defaultOptions = {
    // Acorn options. For more information check objj-acorn.
    // We have a function here to create a new object every time we copy
    // the default options.
    acornOptions: function() { return Object.create(null) },

    // Turn on `sourceMap` generate a source map for the compiler file.
    sourceMap: false,

    // The compiler can do different passes.
    // 1: Parse and walk AST tree to collect file dependencies.
    // 2: Parse and walk to generate code.
    // Pass one is only for when the Objective-J load and runtime.
    pass: 2,

    // Pass in class definitions. New class definitions in source file will be added here when compiling.
    classDefs: function() { return Object.create(null) },

    // Pass in protocol definitions. New protocol definitions in source file will be added here when compiling.
    protocolDefs: function() { return Object.create(null) },

    // Turn off `generate` to make the compile copy the code from the source file (and replace needed parts)
    // instead of generate it from the AST tree. The preprocessor does not work if this is turn off as it alters
    // the AST tree and not the original source. We should deprecate this in the future.
    generate: true,

    // Storage for macros.
    macros: function() { return Object.create(null) },

    // Format description for generated code. For more information look at the readme file in the format folder.
    formatDescription: null,

    // How many spaces for indentation when generation code.
    indentationSpaces: 4,

    // The type of indentation. Default is space. Can be changed to tab or any other string.
    indentationType: " ",

    // Include comments when generating code. This option will turn on the acorn options trackComments and trackCommentsIncludeLineBreak.
    includeComments: false,

    // There is a bug in Safari 2.0 that can't handle a named function declaration. See http://kangax.github.io/nfe/#safari-bug
    // Turn on `transformNamedFunctionDeclarationToAssignment` to make the compiler transform these.
    // We support this here as the old Objective-J compiler (Not a real compiler, Preprocessor.js) transformed
    // named function declarations to assignments.
    // Example: 'function f(x) { return x }' transforms to: 'f = function(x) { return x }'
    transformNamedFunctionDeclarationToAssignment: false,

    // Turn off `includeMethodFunctionNames` to remove function names on methods.
    includeMethodFunctionNames: true,

    // Turn off `includeMethodArgumentTypeSignatures` to remove type information on method arguments.
    includeMethodArgumentTypeSignatures: true,

    // Turn off `includeIvarTypeSignatures` to remove type information on ivars.
    includeIvarTypeSignatures: true,
  };

  function setupOptions(opts) {
    var options = opts || Object.create(null);
    for (var opt in defaultOptions) if (!Object.prototype.hasOwnProperty.call(options, opt)) {
      var defaultOpt = defaultOptions[opt];
      options[opt] = typeof defaultOpt === 'function' ? defaultOpt() : defaultOpt;
    }
    return options;
  }

var ObjJAcornCompiler = function(/*String*/ aString, /*CFURL*/ aURL, options)
{
    this.source = aString;
    this.URL = typeof CFURL !== 'undefined' ? new CFURL(aURL) : aURL;
    options = setupOptions(options);
    this.options = options;
    this.pass = options.pass;
    this.classDefs = options.classDefs;
    this.protocolDefs = options.protocolDefs;
    this.generate = options.generate;
    this.macroDefines = options.macros;
    this.createSourceMap = options.sourceMap;
    this.formatDescription = options.formatDescription;
    this.includeComments = options.includeComments;
    this.transformNamedFunctionDeclarationToAssignment = options.transformNamedFunctionDeclarationToAssignment;
    this.jsBuffer = new StringBuffer(this.createSourceMap, aURL);
    this.imBuffer = null;
    this.cmBuffer = null;
    this.dependencies = [];
    this.warnings = [];
    this.lastPos = 0;

    //this.formatDescription = {
    //    Identifier: {before:"<before>", after:"<after>", parent: {ReturnStatement: {after:"<AFTER>", before:"<BEFORE>"}, Statement: {after:"<After>", before:"<Before>"}}},
    //    BlockStatement: {before:" ", after:"", afterLeftBrace: "\n", beforeRightBrace: "/* Before Brace */"},
    //    Statement: {before:"", after:"/*Statement after*/;\n"}
    //};
    var acornOptions = options.acornOptions;

    if (acornOptions)
    {
        if (!acornOptions.sourceFile)
            acornOptions.sourceFile = this.URL;
        if (options.sourceMap && !acornOptions.locations)
            acornOptions.locations = true;
        // All must be set or we will override
        if (!acornOptions.preprocessIsMacro || !acornOptions.preprocessGetMacro || !acornOptions.preprocessAddMacro || !acornOptions.preprocessUndefineMacro)
            this.setPreprocessMacroFunctions(acornOptions);
    }
    else
    {
        acornOptions = options.acornOptions = {sourceFile: this.URL};
        if (options.sourceMap)
            acornOptions.locations = true;
        this.setPreprocessMacroFunctions(acornOptions);
    }

    try {
        this.tokens = acorn.parse(aString, options.acornOptions);
    }
    catch (e) {
        if (e.lineStart)
        {
            var message = this.prettifyMessage(e, "ERROR");
            console.log(message);
        }
        throw e;
    }

    (this.pass === 2 && (options.includeComments || options.formatDescription) ? compileWithFormat : compile)(this.tokens, new Scope(null ,{ compiler: this }), this.pass === 2 ? pass2 : pass1);

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
}

ObjJAcornCompiler.prototype.setPreprocessMacroFunctions = function(options) {
    var macrosIsPredicate = null;
    var thisCompiler = this;

    var addMacro = function(macro) {
        thisCompiler.macroDefines[macro.identifier] = macro;
        macrosIsPredicate = null;
    }

    var getMacro = function(macroIdentifier) {
        return thisCompiler.macroDefines[macroIdentifier];
    }

    var undefineMacro = function(macroIdentifier) {
        delete thisCompiler.macroDefines[macroIdentifier];
        macrosIsPredicate = null;
    }

    // We are lazy, all in the name of speed, to only create the predicate when needed.
    var isMacro = function(macroIdentifier) {
        return (macrosIsPredicate || (macrosIsPredicate = acorn.makePredicate(Object.keys(thisCompiler.macroDefines).join(" "))))(macroIdentifier);
    }

    options.preprocessAddMacro = addMacro;
    options.preprocessGetMacro = getMacro;
    options.preprocessUndefineMacro = undefineMacro;
    options.preprocessIsMacro = isMacro;
}

exports.compileToExecutable = function(/*String*/ aString, /*CFURL*/ aURL, options)
{
    ObjJAcornCompiler.currentCompileFile = aURL;
    return new ObjJAcornCompiler(aString, aURL, options).executable();
}

exports.compileToIMBuffer = function(/*String*/ aString, /*CFURL*/ aURL, options)
{
    return new ObjJAcornCompiler(aString, aURL, options).IMBuffer();
}

exports.compile = function(/*String*/ aString, /*CFURL*/ aURL, options)
{
    return new ObjJAcornCompiler(aString, aURL, options);
}

exports.compileFileDependencies = function(/*String*/ aString, /*CFURL*/ aURL, options)
{
    ObjJAcornCompiler.currentCompileFile = aURL;
    (options || (options = {})).pass = 1;
    return new ObjJAcornCompiler(aString, aURL, options).executable();
}

ObjJAcornCompiler.prototype.compilePass2 = function()
{
    ObjJAcornCompiler.currentCompileFile = this.URL;
    this.pass = 2;
    this.jsBuffer = new StringBuffer(this.createSourceMap, this.URL);
    this.warnings = [];
    compilePass2(this.tokens, new Scope(null ,{ compiler: this }), pass2);

    for (var i = 0; i < this.warnings.length; i++)
    {
       var message = this.prettifyMessage(this.warnings[i], "WARNING");
       console.log(message);
    }

    return this.jsBuffer.toString();
}

ObjJAcornCompiler.prototype.addWarning = function(/* Warning */ aWarning)
{
    this.warnings.push(aWarning);
}

ObjJAcornCompiler.prototype.getIvarForClass = function(/* String */ ivarName, /* Scope */ scope)
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
}

ObjJAcornCompiler.prototype.getClassDef = function(/* String */ aClassName)
{
    if (!aClassName) return null;

    var c = this.classDefs[aClassName];

    if (c) return c;

    if (typeof objj_getClass === 'function')
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
                instanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass)),
                classMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(class_copyMethodList(aClass.isa)),
                superClass = class_getSuperclass(aClass);

            for (var i = 0; i < ivarSize; i++)
            {
                var ivar = ivars[i];

                myIvars[ivar.name] = {"type": ivar.type, "name": ivar.name};
            }

            for (var i = 0; i < protocolSize; i++)
            {
                var protocol = protocols[i],
                    protocolName = protocol_getName(protocol),
                    protocolDef = this.getProtocolDef(protocolName);

                myProtocols[protocolName] = protocolDef;
            }

            c = new ClassDef(true, aClassName, superClass ? this.getClassDef(superClass.name) : null, myIvars, instanceMethodDefs, classMethodDefs, myProtocols);
            this.classDefs[aClassName] = c;
            return c;
        }
    }

    return null;
}

ObjJAcornCompiler.prototype.getProtocolDef = function(/* String */ aProtocolName)
{
    if (!aProtocolName) return null;

    var p = this.protocolDefs[aProtocolName];

    if (p) return p;

    if (typeof objj_getProtocol === 'function')
    {
        var aProtocol = objj_getProtocol(aProtocolName);
        if (aProtocol)
        {
            var protocol = protocols[i],
                protocolName = protocol_getName(protocol),
                requiredInstanceMethods = protocol_copyMethodDescriptionList(protocol, true, true),
                requiredInstanceMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredInstanceMethods),
                requiredClassMethods = protocol_copyMethodDescriptionList(protocol, true, false),
                requiredClassMethodDefs = ObjJAcornCompiler.methodDefsFromMethodList(requiredClassMethods),
                protocols = protocol.protocols,
                inheritFromProtocols = [];

            for (var i = 0, size = protocols.length; i < size; i++)
                inheritFromProtocols.push(compiler.getProtocolDef(protocols[i].name));

            p = new ProtocolDef(protocolName, inheritFromProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);

            this.protocolDefs[aProtocolName] = p;
            return c;
        }
    }

    return null;
//  protocolDef = {"name": protocolName, "protocols": Object.create(null), "required": Object.create(null), "optional": Object.create(null)};
}

ObjJAcornCompiler.methodDefsFromMethodList = function(/* Array */ methodList)
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
}

//FIXME: Does not work anymore
ObjJAcornCompiler.prototype.executable = function()
{
    if (!this._executable)
        this._executable = new Executable(this.jsBuffer ? this.jsBuffer.toString() : null, this.dependencies, this.URL, null, this);
    return this._executable;
}

ObjJAcornCompiler.prototype.IMBuffer = function()
{
    return this.imBuffer;
}

ObjJAcornCompiler.prototype.code = function()
{
    return this.compiledCode;
}

ObjJAcornCompiler.prototype.ast = function()
{
    return JSON.stringify(this.tokens, null, indentationSpaces);
}

ObjJAcornCompiler.prototype.map = function()
{
    return JSON.stringify(this.sourceMap);
}

ObjJAcornCompiler.prototype.prettifyMessage = function(/* Message */ aMessage, /* String */ messageType)
{
    var line = this.source.substring(aMessage.lineStart, aMessage.lineEnd),
        message = "\n" + line;

    message += (new Array(aMessage.column + 1)).join(" ");
    message += (new Array(Math.min(1, line.length) + 1)).join("^") + "\n";
    message += messageType + " line " + aMessage.line + " in " + this.URL + ": " + aMessage.message;

    return message;
}

ObjJAcornCompiler.prototype.error_message = function(errorMessage, node)
{
    var pos = acorn.getLineInfo(this.source, node.start),
        syntaxError = {message: errorMessage, line: pos.line, column: pos.column, lineStart: pos.lineStart, lineEnd: pos.lineEnd};

    return new SyntaxError(this.prettifyMessage(syntaxError, "ERROR"));
}

ObjJAcornCompiler.prototype.pushImport = function(url)
{
    if (!ObjJAcornCompiler.importStack) ObjJAcornCompiler.importStack = [];  // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.

    ObjJAcornCompiler.importStack.push(url);
}

ObjJAcornCompiler.prototype.popImport = function()
{
    ObjJAcornCompiler.importStack.pop();
}

function createMessage(/* String */ aMessage, /* SpiderMonkey AST node */ node, /* String */ code)
{
    var message = acorn.getLineInfo(code, node.start);

    message.message = aMessage;

    return message;
}

function compile(node, state, visitor) {
    function c(node, st, override) {
        visitor[override || node.type](node, st, c);
    }
    c(node, state);
};

function compileWithFormat(node, state, visitor) {
    var lastNode, lastComment;
    function c(node, st, override) {
        var compiler = st.compiler,
            includeComments = compiler.includeComments,
            parentNode = st.currentNode(),
            localLastNode = lastNode,
            sameNode = localLastNode === node;
        //console.log(override || node.type);
        lastNode = node;
        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment) {
            for (var i = 0; i < node.commentsBefore.length; i++)
                compiler.jsBuffer.concat(node.commentsBefore[i]);
        }
        st.pushNode(node, override);
        var formatDescription = st.formatDescription();
        //console.log("formatDescription: " + JSON.stringify(formatDescription) + ", node.type: " + node.type + ", override: " + override);        
        if (!sameNode && formatDescription && formatDescription.before)
            compiler.jsBuffer.concatFormat(formatDescription.before);
        visitor[override || node.type](node, st, c, formatDescription);
        if (!sameNode && formatDescription && formatDescription.after)
            compiler.jsBuffer.concatFormat(formatDescription.after);
        st.popNode();
        if (includeComments && !sameNode && node.commentsAfter) {
            for (var i = 0; i < node.commentsAfter.length; i++)
                compiler.jsBuffer.concat(node.commentsAfter[i]);
            lastComment = node.commentsAfter;
        } else {
            lastComment = null;
        }
    }
    c(node, state);
};

function isIdempotentExpression(node) {
    switch (node.type) {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (var i = 0; i < node.elements.length; ++i) {
                if (!isIdempotentExpression(node.elements[i]))
                    return false;
            }

            return true;

        case "DictionaryLiteral":
            for (var i = 0; i < node.keys.length; ++i) {
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

// We do not allow dereferencing of expressions with side effects because we might need to evaluate the expression twice in certain uses of deref, which is not obvious when you look at the deref operator in plain code.
function checkCanDereference(st, node) {
    if (!isIdempotentExpression(node))
        throw st.compiler.error_message("Dereference of expression with side effects", node);
}

// Surround expression with parentheses
function surroundExpression(c) {
    return function(node, st, override, format) {
      st.compiler.jsBuffer.concat("(");
      c(node, st, override, format);
      st.compiler.jsBuffer.concat(")");
    }
}

var operatorPrecedence = {
    // MemberExpression
    // These two are never used as they are a MemberExpression with the attribute 'computed' which tells what operator it uses.
    //".": 0, "[]": 0,
    // NewExpression
    // This is never used.
    //"new": 1,
    // All these are UnaryExpression or UpdateExpression and never used.
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
}

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
}

// Returns true if subNode has higher precedence the the root node.
// If the subNode is the right (as in left/right) subNode
function nodePrecedence(node, subNode, right) {
    var nodeType = node.type,
        nodePrecedence = expressionTypePrecedence[nodeType] || -1,
        subNodePrecedence = expressionTypePrecedence[subNode.type] || -1,
        nodeOperatorPrecedence,
        subNodeOperatorPrecedence;
    return nodePrecedence < subNodePrecedence || (nodePrecedence === subNodePrecedence && isLogicalBinary(nodeType) && ((nodeOperatorPrecedence = operatorPrecedence[node.operator]) < (subNodeOperatorPrecedence = operatorPrecedence[subNode.operator]) || (right && nodeOperatorPrecedence === subNodeOperatorPrecedence)));
}

var pass1 = walk.make({
ImportStatement: function(node, st, c) {
    var urlString = node.filename.value;

    st.compiler.dependencies.push(typeof FileDependency !== 'undefined' ? new FileDependency(typeof CFURL !== 'undefined' ? new CFURL(urlString) : urlString, node.localfilepath) : urlString);
}
});

var indentType = " ";
var indentationSpaces = 4;
var indentationSize = indentationSpaces * indentType.length;
var indentStep = Array(indentationSpaces + 1).join(indentType);
var indentation = "";

var pass2 = walk.make({
Program: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;

    indentType = compiler.options.indentationType;
    indentationSpaces = compiler.options.indentationSpaces;
    indentationSize = indentationSpaces * indentType.length;
    indentStep = Array(indentationSpaces + 1).join(indentType);
    indentation = "";

    for (var i = 0; i < node.body.length; ++i) {
      c(node.body[i], st, "Statement");
    }
    if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.end));

    // Check maybe warnings
    var maybeWarnings = st.maybeWarnings();
    if (maybeWarnings) for (var i = 0; i < maybeWarnings.length; i++) {
        var maybeWarning = maybeWarnings[i];
        if (maybeWarning.checkIfWarning(st)) {
            compiler.addWarning(maybeWarning.message);
        }
    }
},
BlockStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      var skipIndentation = st.skipIndentation;
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("{");
        buffer.concatFormat(format.afterLeftBrace);
      } else {
        if (skipIndentation)
          delete st.skipIndentation;
        else
          buffer.concat(indentation.substring(indentationSize));
        buffer.concat("{\n");
      }
    }
    for (var i = 0; i < node.body.length; ++i) {
      c(node.body[i], st, "Statement");
    }
    if (generate) {
      if (format) {
        buffer.concatFormat(format.beforeRightBrace);
        buffer.concat("}");
      } else {
        buffer.concat(indentation.substring(indentationSize));
        buffer.concat("}");
        if (!skipIndentation && st.isDecl !== false)
            buffer.concat("\n");
        st.indentBlockLevel--;
      }
    }
},
ExpressionStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate && !format;
    if (generate) compiler.jsBuffer.concat(indentation);
    c(node.expression, st, "Expression");
    if (generate) compiler.jsBuffer.concat(";\n");
},
IfStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("if", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        // Keep the 'else' and 'if' on the same line if it is an 'else if'
        if (!st.superNodeIsElse)
          buffer.concat(indentation);
        else
          delete st.superNodeIsElse;
        buffer.concat("if (", node);
      }
    }
    c(node.test, st, "Expression");
    if (generate) {
        if (format) {
            buffer.concat(")");
            buffer.concatFormat(format.afterRightParenthesis);
        } else {
            buffer.concat(")\n");
        }
    }
    indentation += indentStep;
    c(node.consequent, st, "Statement");
    indentation = indentation.substring(indentationSize);
    var alternate = node.alternate;
    if (alternate) {
      var alternateNotIf = alternate.type !== "IfStatement";
      if (generate) {
        if (format) {
          buffer.concatFormat(format.beforeElse); // Do we need this?
          buffer.concat("else");
          buffer.concatFormat(format.afterElse);
        } else {
          buffer.concat(indentation);
          buffer.concat(alternateNotIf ? "else\n" : "else ");
        }
      }
      if (alternateNotIf)
        indentation += indentStep;
      else
        st.superNodeIsElse = true;

      c(alternate, st, "Statement");
      if (alternateNotIf) indentation = indentation.substring(indentationSize);
    }
},
LabeledStatement: function(node, st, c, format) {
    var compiler = st.compiler;
    if (compiler.generate) {
      var buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      c(node.label, st, "IdentifierName");
      if (format) {
        buffer.concat(":");
        buffer.concatFormat(format.afterColon);
      } else {
        buffer.concat(": ");
      }
    }
    c(node.body, st, "Statement");
},
BreakStatement: function(node, st, c, format) {
    var compiler = st.compiler;
    if (compiler.generate) {
      var label = node.label,
          buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      if (label) {
        if (format) {
          buffer.concat("break", node);
          buffer.concatFormat(format.beforeLabel);
        } else {
          buffer.concat("break ", node);
        }
        c(label, st, "IdentifierName");
        if (!format) buffer.concat(";\n");
      } else
        buffer.concat(format ? "break" : "break;\n", node);
    }
},
ContinueStatement: function(node, st, c, format) {
    var compiler = st.compiler;
    if (compiler.generate) {
      var label = node.label,
          buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      if (label) {
        if (format) {
          buffer.concat("continue", node);
          buffer.concatFormat(format.beforeLabel);
        } else {
          buffer.concat("continue ", node);
        }
        c(label, st, "IdentifierName");
        if (!format) buffer.concat(";\n");
      } else
        buffer.concat(format ? "continue" : "continue;\n", node);
    }
},
WithStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("with", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        buffer.concat(indentation);
        buffer.concat("with(", node);
      }
    }
    c(node.object, st, "Expression");
    if (generate)
      if (format) {
        buffer.concat(")");
        buffer.concatFormat(format.afterRightParenthesis);
      } else {
        buffer.concat(")\n");
      }
    indentation += indentStep;
    c(node.body, st, "Statement");
    indentation = indentation.substring(indentationSize);
},
SwitchStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("switch", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(", node);
      } else {
        buffer.concat(indentation);
        buffer.concat("switch(", node);
      }
    }
    c(node.discriminant, st, "Expression");
    if (generate)
      if (format) {
        buffer.concat(")");
        buffer.concatFormat(format.afterRightParenthesis);
        buffer.concat("{");
        buffer.concatFormat(format.afterLeftBrace);
      } else {
        buffer.concat(") {\n");
      }
    indentation += indentStep;
    for (var i = 0; i < node.cases.length; ++i) {
      var cs = node.cases[i];
      if (cs.test) {
        if (generate) {
          if (format) {
            buffer.concatFormat(format.beforeCase);
            buffer.concat("case", node);
            buffer.concatFormat(format.afterCase);
          } else {
            buffer.concat(indentation);
            buffer.concat("case ");
          }
        }
        c(cs.test, st, "Expression");
        if (generate)
          if (format) {
            buffer.concat(":");
            buffer.concatFormat(format.afterColon);
          } else {
            buffer.concat(":\n");
          }
      } else
        if (generate)
          if (format) {
            buffer.concatFormat(format.beforeCase);
            buffer.concat("default");
            buffer.concatFormat(format.afterCase);
            buffer.concat(":");
            buffer.concatFormat(format.afterColon);
          } else {
            buffer.concat("default:\n");
          }
      indentation += indentStep;
      for (var j = 0; j < cs.consequent.length; ++j)
        c(cs.consequent[j], st, "Statement");
      indentation = indentation.substring(indentationSize);
    }
    indentation = indentation.substring(indentationSize);
    if (generate) {
      if (format) {
        buffer.concatFormat(format.beforeRightBrace);
        buffer.concat("}");
      } else {
        buffer.concat(indentation);
        buffer.concat("}\n");
      }
    }
},
ReturnStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      buffer.concat("return", node);
    }
    if (node.argument) {
      if (generate) buffer.concatFormat(format ? format.beforeExpression : " ");
      c(node.argument, st, "Expression");
    }
    if (generate && !format) buffer.concat(";\n");
},
ThrowStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      buffer.concat("throw", node);
      buffer.concatFormat(format ? format.beforeExpression : " ");
    }
    c(node.argument, st, "Expression");
    if (generate && !format) buffer.concat(";\n");
},
TryStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (!format) buffer.concat(indentation);
      buffer.concat("try", node);
      buffer.concatFormat(format ? format.beforeStatement : " ");
    }
    indentation += indentStep;
    if (!format) st.skipIndentation = true;
    c(node.block, st, "Statement");
    indentation = indentation.substring(indentationSize);
    if (node.handler) {
      var handler = node.handler,
          inner = new Scope(st),
          param = handler.param,
          name = param.name;
      inner.vars[name] = {type: "catch clause", node: param};
      if (generate) {
        if (format) {
          buffer.concatFormat(format.beforeCatch);
          buffer.concat("catch");
          buffer.concatFormat(format.afterCatch);
          buffer.concat("(");
          c(param, st, "IdentifierName");
          buffer.concat(")");
          buffer.concatFormat(format.beforeCatchStatement);
        } else {
          buffer.concat("\n");
          buffer.concat(indentation);
          buffer.concat("catch(");
          buffer.concat(name);
          buffer.concat(") ");
        }
      }
      indentation += indentStep;
      inner.skipIndentation = true;
      c(handler.body, inner, "ScopeBody");
      indentation = indentation.substring(indentationSize);
      inner.copyAddedSelfToIvarsToParent();
    }
    if (node.finalizer) {
      if (generate) {
        if (format) {
          buffer.concatFormat(format.beforeCatch);
          buffer.concat("finally");
          buffer.concatFormat(format.beforeCatchStatement);
        } else {
          buffer.concat("\n");
          buffer.concat(indentation);
          buffer.concat("finally ");
        }
      }
      indentation += indentStep;
      st.skipIndentation = true;
      c(node.finalizer, st, "Statement");
      indentation = indentation.substring(indentationSize);
    }
    if (generate && !format)
        buffer.concat("\n");
},
WhileStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("while", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        buffer.concat(indentation);
        buffer.concat("while (", node);
      }
    }
    c(node.test, st, "Expression");
    if (generate)
      if (format) {
        buffer.concat(")");
        buffer.concatFormat(format.afterRightParenthesis);
      } else {
        // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
        buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
      }
    indentation += indentStep;
    c(body, st, "Statement");
    indentation = indentation.substring(indentationSize);
},
DoWhileStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("do", node);
        buffer.concatFormat(format.beforeStatement);
      } else {
        buffer.concat(indentation);
        buffer.concat("do\n", node);
      }
    }
    indentation += indentStep;
    c(node.body, st, "Statement");
    indentation = indentation.substring(indentationSize);
    if (generate) {
      if (format) {
        buffer.concat("while");
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        buffer.concat(indentation);
        buffer.concat("while (");
      }
    }
    c(node.test, st, "Expression");
    if (generate) buffer.concatFormat(format ? ")" : ");\n");
},
ForStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("for", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        buffer.concat(indentation);
        buffer.concat("for (", node);
      }
    }
    if (node.init) c(node.init, st, "ForInit");
    if (generate) buffer.concat(format ? ";" : "; ");
    if (node.test) c(node.test, st, "Expression");
    if (generate) buffer.concat(format ? ";" : "; ");
    if (node.update) c(node.update, st, "Expression");
    if (generate)
      if (format) {
        buffer.concat(")");
        buffer.concatFormat(format.afterRightParenthesis);
      } else {
        // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
        buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
      }
    indentation += indentStep;
    c(body, st, "Statement");
    indentation = indentation.substring(indentationSize);
},
ForInStatement: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        body = node.body,
        buffer;
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("for", node);
        buffer.concatFormat(format.beforeLeftParenthesis);
        buffer.concat("(");
      } else {
        buffer.concat(indentation);
        buffer.concat("for (", node);
      }
    }
    c(node.left, st, "ForInit");
    if (generate)
        if (format) {
            buffer.concatFormat(format.beforeIn);
            buffer.concat("in");
            buffer.concatFormat(format.afterIn);
        } else {
            buffer.concat(" in ");
        }
    c(node.right, st, "Expression");
    if (generate)
      if (format) {
        buffer.concat(")");
        buffer.concatFormat(format.afterRightParenthesis);
      } else {
        // We don't want EmptyStatements to generate an extra parenthesis except when it is in a while, for, ...
        buffer.concat(body.type === "EmptyStatement" ? ");\n" : ")\n");
      }
    indentation += indentStep;
    c(body, st, "Statement");
    indentation = indentation.substring(indentationSize);
},
ForInit: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;
    if (node.type === "VariableDeclaration") {
        st.isFor = true;
        c(node, st);
        delete st.isFor;
    } else
      c(node, st, "Expression");
},
DebuggerStatement: function(node, st, c, format) {
    var compiler = st.compiler;
    if (compiler.generate) {
      var buffer = compiler.jsBuffer;
      if (format) {
        buffer.concat("debugger", node);
      } else {
        buffer.concat(indentation);
        buffer.concat("debugger;\n", node);
      }
    }
},
Function: function(node, st, c, format) {
  var compiler = st.compiler,
      generate = compiler.generate,
      buffer = compiler.jsBuffer,
      inner = new Scope(st),
      decl = node.type == "FunctionDeclaration",
      id = node.id;

  inner.isDecl = decl;
  for (var i = 0; i < node.params.length; ++i)
    inner.vars[node.params[i].name] = {type: "argument", node: node.params[i]};
  if (generate && !format)
    buffer.concat(indentation);
  if (id) {
    var name = id.name;
    (decl ? st : inner).vars[name] = {type: decl ? "function" : "function name", node: id};
    if (compiler.transformNamedFunctionDeclarationToAssignment) {
      if (generate) {
        buffer.concat(name);
        buffer.concat(" = ");
      } else {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(name);
        buffer.concat(" = function");
        compiler.lastPos = id.end;
      }
    }
  }
  if (generate) {
    buffer.concat("function", node);
    if (!compiler.transformNamedFunctionDeclarationToAssignment && id)
    {
        if (!format) buffer.concat(" ");
        c(id, st, "IdentifierName");
    }
    if (format) buffer.concatFormat(format.beforeLeftParenthesis);
    buffer.concat("(");
    for (var i = 0; i < node.params.length; ++i) {
      if (i)
        buffer.concat(format ? "," : ", ");
      c(node.params[i], st, "IdentifierName");
    }
    if (format) {
      buffer.concat(")");
      buffer.concatFormat(format.afterRightParenthesis);
    } else {
      buffer.concat(")\n");
    }
  }
  indentation += indentStep;
  c(node.body, inner, "ScopeBody");
  indentation = indentation.substring(indentationSize);
  inner.copyAddedSelfToIvarsToParent();
},
VariableDeclaration: function(node, st, c, format) {
  var compiler = st.compiler,
      generate = compiler.generate,
      buffer;
  if (generate) {
    buffer = compiler.jsBuffer;
    if (!st.isFor && !format) buffer.concat(indentation);
    buffer.concat(format ? "var" : "var ", node);
  }
  for (var i = 0; i < node.declarations.length; ++i) {
    var decl = node.declarations[i],
        identifier = decl.id.name;
    if (i)
      if (generate) {
        if (format) {
          buffer.concat(",");
        } else {
          if (st.isFor)
            buffer.concat(", ");
          else {
            buffer.concat(",\n");
            buffer.concat(indentation);
            buffer.concat("    ");
          }
        }
      }
    st.vars[identifier] = {type: "var", node: decl.id};
    c(decl.id, st, "IdentifierName");
    if (decl.init) {
      if (generate) {
        if (format) {
          buffer.concatFormat(format.beforeEqual);
          buffer.concat("=");
          buffer.concatFormat(format.afterEqual);
        } else {
          buffer.concat(" = ");
        }
      }
      c(decl.init, st, "Expression");
    }
    // FIXME: Extract to function
    if (st.addedSelfToIvars) {
      var addedSelfToIvar = st.addedSelfToIvars[identifier];
      if (addedSelfToIvar) {
        var atoms = st.compiler.jsBuffer.atoms;
        for (var i = 0, size = addedSelfToIvar.length; i < size; i++) {
          var dict = addedSelfToIvar[i];
          atoms[dict.index] = "";
          compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", dict.node, compiler.source));
        }
        st.addedSelfToIvars[identifier] = [];
      }
    }
  }
  if (generate && !format && !st.isFor) buffer.concat(";\n"); // Don't add ';' if this is a for statement but do it if this is a statement
},
ThisExpression: function(node, st, c) {
    var compiler = st.compiler;

    if (compiler.generate) compiler.jsBuffer.concat("this", node);
},
ArrayExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;

        if (generate) {
            buffer = compiler.jsBuffer;
            buffer.concat("[", node);
        }

        for (var i = 0; i < node.elements.length; ++i) {
            var elt = node.elements[i];

            if (generate && i !== 0)
                if (format) {
                    buffer.concatFormat(format.beforeComma);
                    buffer.concat(",");
                    buffer.concatFormat(format.afterComma);
                } else
                    buffer.concat(", ");

            if (elt) c(elt, st, "Expression");
        }
        if (generate) buffer.concat("]");
},
ObjectExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        properties = node.properties,
        buffer = compiler.jsBuffer;
    if (generate) buffer.concat("{", node);
    for (var i = 0, size = properties.length; i < size; ++i)
    {
        var prop = properties[i];
        if (generate) {
          if (i)
            if (format) {
                buffer.concatFormat(format.beforeComma);
                buffer.concat(",");
                buffer.concatFormat(format.afterComma);
            } else
                buffer.concat(", ");
          st.isPropertyKey = true;
          c(prop.key, st, "Expression");
          delete st.isPropertyKey;
          if (format) {
            buffer.concatFormat(format.beforeColon);
            buffer.concat(":");
            buffer.concatFormat(format.afterColon);
          } else {
            buffer.concat(": ");
          }
        } else if (prop.key.raw && prop.key.raw.charAt(0) === "@") {
          buffer.concat(compiler.source.substring(compiler.lastPos, prop.key.start));
          compiler.lastPos = prop.key.start + 1;
        }

        c(prop.value, st, "Expression");
    }
    if (generate) buffer.concat("}");
},
SequenceExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    if (generate) {
        buffer = compiler.jsBuffer;
        buffer.concat("(");
    }
    for (var i = 0; i < node.expressions.length; ++i) {
      if (generate && i !== 0)
        if (format) {
            buffer.concatFormat(format.beforeComma);
            buffer.concat(",");
            buffer.concatFormat(format.afterComma);
        } else
            buffer.concat(", ");
      c(node.expressions[i], st, "Expression");
    }
    if (generate) buffer.concat(")");
},
UnaryExpression: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        argument = node.argument;
    if (generate) {
      var buffer = compiler.jsBuffer;
      if (node.prefix) {
        buffer.concat(node.operator, node);
        if (wordPrefixOperators(node.operator))
          buffer.concat(" ");
        (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression");
      } else {
        (nodePrecedence(node, argument) ? surroundExpression(c) : c)(argument, st, "Expression");
        buffer.concat(node.operator);
      }
    } else {
      c(argument, st, "Expression");
    }
},
UpdateExpression: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer;
    if (node.argument.type === "Dereference") {
        checkCanDereference(st, node.argument);

        // @deref(x)++ and ++@deref(x) require special handling.
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // Output the dereference function, "(...)(z)"
        buffer.concat((node.prefix ? "" : "(") + "(");

        // The thing being dereferenced.
        if (!generate) compiler.lastPos = node.argument.expr.start;
        c(node.argument.expr, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.expr.end));
        buffer.concat(")(");

        if (!generate) compiler.lastPos = node.argument.start;
        c(node.argument, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.argument.end));
        buffer.concat(" " + node.operator.substring(0, 1) + " 1)" + (node.prefix ? "" : node.operator == '++' ? " - 1)" : " + 1)"));

        if (!generate) compiler.lastPos = node.end;
        return;
    }

    if (node.prefix) {
      if (generate) {
        buffer.concat(node.operator, node);
        if (wordPrefixOperators(node.operator))
          buffer.concat(" ");
      }
      (generate && nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression");
    } else {
      (generate && nodePrecedence(node, node.argument) ? surroundExpression(c) : c)(node.argument, st, "Expression");
      if (generate) buffer.concat(node.operator);
    }
},
BinaryExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        operatorType = isInInstanceof(node.operator);
    (generate && nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression");
    if (generate) {
        var buffer = compiler.jsBuffer;
        buffer.concatFormat(format ? format.beforeOperator : " ");
        buffer.concat(node.operator);
        buffer.concatFormat(format ? format.afterOperator : " ");
    }
    (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
},
LogicalExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate;
    (generate && nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression");
    if (generate) {
        var buffer = compiler.jsBuffer;
        buffer.concatFormat(format ? format.beforeOperator : " ");
        buffer.concat(node.operator);
        buffer.concatFormat(format ? format.afterOperator : " ");
    }
    (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
},
AssignmentExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        saveAssignment = st.assignment,
        buffer = compiler.jsBuffer;

    if (node.left.type === "Dereference") {
        checkCanDereference(st, node.left);

        // @deref(x) = z    -> x(z) etc
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

        // Output the dereference function, "(...)(z)"
        buffer.concat("(");
        // What's being dereferenced could itself be an expression, such as when dereferencing a deref.
        if (!generate) compiler.lastPos = node.left.expr.start;
        c(node.left.expr, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.left.expr.end));
        buffer.concat(")(");

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator !== "=") {
            // Output the whole .left, not just .left.expr.
            if (!generate) compiler.lastPos = node.left.start;
            c(node.left, st, "Expression");
            if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.left.end));
            buffer.concat(" " + node.operator.substring(0, 1) + " ");
        }

        if (!generate) compiler.lastPos = node.right.start;
        c(node.right, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.right.end));
        buffer.concat(")");

        if (!generate) compiler.lastPos = node.end;

        return;
    }

    var saveAssignment = st.assignment;
    st.assignment = true;
    (generate && nodePrecedence(node, node.left) ? surroundExpression(c) : c)(node.left, st, "Expression");
    if (generate) {
        buffer.concatFormat(format ? format.beforeOperator : " ");
        buffer.concat(node.operator);
        buffer.concatFormat(format ? format.afterOperator : " ");
    }
    st.assignment = saveAssignment;
    (generate && nodePrecedence(node, node.right, true) ? surroundExpression(c) : c)(node.right, st, "Expression");
    if (st.isRootScope() && node.left.type === "Identifier" && !st.getLvar(node.left.name))
        st.vars[node.left.name] = {type: "global", node: node.left};
},
ConditionalExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer;
    (generate && nodePrecedence(node, node.test) ? surroundExpression(c) : c)(node.test, st, "Expression");
    if (generate) {
      buffer = compiler.jsBuffer;
      if (format) {
        buffer.concatFormat(format.beforeOperator);
        buffer.concat("?");
        buffer.concatFormat(format.afterOperator);
      } else {
        buffer.concat(" ? ");
      }
    }
    c(node.consequent, st, "Expression");
    if (generate)
      if (format) {
        buffer.concatFormat(format.beforeOperator);
        buffer.concat(":");
        buffer.concatFormat(format.afterOperator);
      } else {
        buffer.concat(" : ");
      }
    c(node.alternate, st, "Expression");
},
NewExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        nodeArguments = node.arguments,
        generate = compiler.generate,
        buffer;
    if (generate) {
        buffer = compiler.jsBuffer;
        buffer.concat("new ", node);
    }
    (generate && nodePrecedence(node, node.callee) ? surroundExpression(c) : c)(node.callee, st, "Expression");
    if (generate) buffer.concat("(");
    if (nodeArguments) {
      for (var i = 0, size = nodeArguments.length; i < size; ++i) {
        if (i && generate)
          buffer.concatFormat(format ? "," : ", ");
        c(nodeArguments[i], st, "Expression");
      }
    }
    if (generate) buffer.concat(")");
},
CallExpression: function(node, st, c, format) {
    var compiler = st.compiler,
        nodeArguments = node.arguments,
        generate = compiler.generate,
        buffer;
    (generate && nodePrecedence(node, node.callee) ? surroundExpression(c) : c)(node.callee, st, "Expression");
    if (generate) {
        buffer = compiler.jsBuffer;
        buffer.concat("(");
    }
    if (nodeArguments) {
      for (var i = 0, size = nodeArguments.length; i < size; ++i) {
        if (i && generate)
          buffer.concatFormat(format ? "," : ", ");
        c(nodeArguments[i], st, "Expression");
      }
    }
    if (generate) buffer.concat(")");
},
MemberExpression: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        computed = node.computed;
    (generate && nodePrecedence(node, node.object) ? surroundExpression(c) : c)(node.object, st, "Expression");
    if (generate)
        compiler.jsBuffer.concat(computed ? "[" : ".", node);
    st.secondMemberExpression = !computed;
    // No parentheses when it is computed, '[' amd ']' are the same thing.
    (generate && !computed && nodePrecedence(node, node.property) ? surroundExpression(c) : c)(node.property, st, "Expression");
    st.secondMemberExpression = false;
    if (generate && computed)
      compiler.jsBuffer.concat("]");
},
Identifier: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        identifier = node.name;
    if (st.currentMethodType() === "-" && !st.secondMemberExpression && !st.isPropertyKey)
    {
        var lvar = st.getLvar(identifier, true), // Only look inside method
            ivar = compiler.getIvarForClass(identifier, st);

        if (ivar)
        {
            if (lvar)
                compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides instance variable", node, compiler.source));
            else
            {
                var nodeStart = node.start;

                if (!generate) do {    // The Spider Monkey AST tree includes any parentheses in start and end properties so we have to make sure we skip those
                    compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, nodeStart));
                    compiler.lastPos = nodeStart;
                } while (compiler.source.substr(nodeStart++, 1) === "(")
                // Save the index in where the "self." string is stored and the node.
                // These will be used if we find a variable declaration that is hoisting this identifier.
                ((st.addedSelfToIvars || (st.addedSelfToIvars = Object.create(null)))[identifier] || (st.addedSelfToIvars[identifier] = [])).push({node: node, index: compiler.jsBuffer.length()});
                compiler.jsBuffer.concat("self.", node);
            }
        } else if (!reservedIdentifiers(identifier)) {  // Don't check for warnings if it is a reserved word like self, localStorage, _cmd, etc...
            var message,
                classOrGlobal = typeof global[identifier] !== "undefined" || (typeof window !== 'undefined' && typeof window[identifier] !== "undefined") || compiler.getClassDef(identifier),
                globalVar = st.getLvar(identifier);
            if (classOrGlobal && (!globalVar || globalVar.type !== "class")) { // It can't be declared with a @class statement.
                /* Turned off this warning as there are many many warnings when compiling the Cappuccino frameworks - Martin
                if (lvar) {
                    message = compiler.addWarning(createMessage("Local declaration of '" + identifier + "' hides global variable", node, compiler.source));
                }*/
            } else if (!globalVar) {
                if (st.assignment) {
                    message = new GlobalVariableMaybeWarning("Creating global variable inside function or method '" + identifier + "'", node, compiler.source);
                    // Turn off these warnings for this identifier, we only want one.
                    st.vars[identifier] = {type: "remove global warning", node: node};
                } else {
                    message = new GlobalVariableMaybeWarning("Using unknown class or uninitialized global variable '" + identifier + "'", node, compiler.source);
                }
            }
            if (message)
                st.addMaybeWarning(message);
        }
    }
    if (generate) compiler.jsBuffer.concat(identifier, node);
},
// Use this when there should not be a look up to issue warnings or add 'self.' before ivars
IdentifierName: function(node, st, c) {
    var compiler = st.compiler;
    if (compiler.generate)
        compiler.jsBuffer.concat(node.name, node);
},
Literal: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;
    if (generate) {
      if (node.raw && node.raw.charAt(0) === "@")
        compiler.jsBuffer.concat(node.raw.substring(1), node);
      else
        compiler.jsBuffer.concat(node.raw, node);
    } else if (node.raw.charAt(0) === "@") {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start + 1;
    }
},
ArrayLiteral: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;
    if (!generate) {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
    }

    if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    if (!node.elements.length) {
        compiler.jsBuffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"init\")", node);
    } else {
        compiler.jsBuffer.concat("objj_msgSend(objj_msgSend(CPArray, \"alloc\"), \"initWithObjects:count:\", [", node);
        for (var i = 0; i < node.elements.length; i++) {
            var elt = node.elements[i];

            if (i)
                compiler.jsBuffer.concat(", ");

            if (!generate) compiler.lastPos = elt.start;
            c(elt, st, "Expression");
            if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, elt.end));
        }
        compiler.jsBuffer.concat("], " + node.elements.length + ")");
    }

    if (!generate) compiler.lastPos = node.end;
},
DictionaryLiteral: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;
    if (!generate) {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
    }

    if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    if (!node.keys.length) {
        compiler.jsBuffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"init\")", node);
    } else {
        compiler.jsBuffer.concat("objj_msgSend(objj_msgSend(CPDictionary, \"alloc\"), \"initWithObjectsAndKeys:\"", node);
        for (var i = 0; i < node.keys.length; i++) {
            var key = node.keys[i],
                value = node.values[i];

            compiler.jsBuffer.concat(", ");

            if (!generate) compiler.lastPos = value.start;
            c(value, st, "Expression");
            if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, value.end));

            compiler.jsBuffer.concat(", ");

            if (!generate) compiler.lastPos = key.start;
            c(key, st, "Expression");
            if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, key.end));
        }
        compiler.jsBuffer.concat(")");
    }

    if (!generate) compiler.lastPos = node.end;
},
ImportStatement: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer;

    if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
    buffer.concat("objj_executeFile(\"", node);
    buffer.concat(node.filename.value);
    buffer.concat(node.localfilepath ? "\", YES);" : "\", NO);");
    if (!generate) compiler.lastPos = node.end;
},
ClassDeclarationStatement: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        saveJSBuffer = compiler.jsBuffer,
        className = node.classname.name,
        classDef = compiler.getClassDef(className),
        classScope = new Scope(st),
        isInterfaceDeclaration = node.type === "InterfaceDeclarationStatement",
        protocols = node.protocols;

    compiler.imBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);
    compiler.cmBuffer = new StringBuffer(compiler.createSourceMap), compiler.URL;
    compiler.classBodyBuffer = new StringBuffer(compiler.createSourceMap, compiler.URL);      // TODO: Check if this is needed

    if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    // First we declare the class
    if (node.superclassname)
    {
        // Must have methods dictionaries and ivars dictionary to be a real implementaion declaration.
        // Without it is a "@class" declaration (without both ivars dictionary and method dictionaries) or
        // "interface" declaration (without ivars dictionary)
        // TODO: Create a ClassDef object and add this logic to it
        if (classDef && classDef.ivars)
            // It has a real implementation declaration already
            throw compiler.error_message("Duplicate class " + className, node.classname);

        if (isInterfaceDeclaration && classDef && classDef.instanceMethods && classDef.classMethods)
            // It has a interface declaration already
            throw compiler.error_message("Duplicate interface definition for class " + className, node.classname);
        var superClassDef = compiler.getClassDef(node.superclassname.name);
        if (!superClassDef)
        {
            var errorMessage = "Can't find superclass " + node.superclassname.name;
            for (var i = ObjJAcornCompiler.importStack.length; --i >= 0;)
                errorMessage += "\n" + Array((ObjJAcornCompiler.importStack.length - i) * 2 + 1).join(" ") + "Imported by: " + ObjJAcornCompiler.importStack[i];
            throw compiler.error_message(errorMessage, node.superclassname);
        }

        classDef = new ClassDef(!isInterfaceDeclaration, className, superClassDef, Object.create(null));

        saveJSBuffer.concat("{var the_class = objj_allocateClassPair(" + node.superclassname.name + ", \"" + className + "\"),\nmeta_class = the_class.isa;", node);
    }
    else if (node.categoryname)
    {
        classDef = compiler.getClassDef(className);
        if (!classDef)
            throw compiler.error_message("Class " + className + " not found ", node.classname);

        saveJSBuffer.concat("{\nvar the_class = objj_getClass(\"" + className + "\")\n", node);
        saveJSBuffer.concat("if(!the_class) throw new SyntaxError(\"*** Could not find definition for class \\\"" + className + "\\\"\");\n");
        saveJSBuffer.concat("var meta_class = the_class.isa;");
    }
    else
    {
        classDef = new ClassDef(!isInterfaceDeclaration, className, null, Object.create(null));

        saveJSBuffer.concat("{var the_class = objj_allocateClassPair(Nil, \"" + className + "\"),\nmeta_class = the_class.isa;", node);
    }

    if (protocols) for (var i = 0, size = protocols.length; i < size; i++)
    {
        saveJSBuffer.concat("\nvar aProtocol = objj_getProtocol(\"" + protocols[i].name + "\");", protocols[i]);
        saveJSBuffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocols[i].name + "\\\"\");");
        saveJSBuffer.concat("\nclass_addProtocol(the_class, aProtocol);");
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

    // Then we add all ivars
    if (node.ivardeclarations) for (var i = 0; i < node.ivardeclarations.length; ++i)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarName = ivarDecl.id.name,
            ivars = classDef.ivars,
            ivar = {"type": ivarType, "name": ivarName};

        if (ivars[ivarName])
            throw compiler.error_message("Instance variable '" + ivarName + "'is already declared for class " + className, ivarDecl.id);

        if (firstIvarDeclaration)
        {
            firstIvarDeclaration = false;
            saveJSBuffer.concat("class_addIvars(the_class, [");
        }
        else
            saveJSBuffer.concat(", ");

        if (compiler.options.includeIvarTypeSignatures)
            saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\", \"" + ivarType + "\")", node);
        else
            saveJSBuffer.concat("new objj_ivar(\"" + ivarName + "\")", node);

        if (ivarDecl.outlet)
            ivar.outlet = true;
        ivars[ivarName] = ivar;
        if (!classScope.ivars)
            classScope.ivars = Object.create(null);
        classScope.ivars[ivarName] = {type: "ivar", name: ivarName, node: ivarDecl.id, ivar: ivar};

        if (!hasAccessors && ivarDecl.accessors)
            hasAccessors = true;
    }

    if (!firstIvarDeclaration)
        saveJSBuffer.concat("]);");

    // If we have accessors add get and set methods for them
    if (!isInterfaceDeclaration && hasAccessors)
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

            var property = (accessors.property && accessors.property.name) || ivarName,
                getterName = (accessors.getter && accessors.getter.name) || property,
                getterCode = "- (" + (ivarType ? ivarType : "id") + ")" + getterName + "\n{\nreturn " + ivarName + ";\n}\n";

            getterSetterBuffer.concat(getterCode);

            if (accessors.readonly)
                continue;

            var setterName = accessors.setter ? accessors.setter.name : null;

            if (!setterName)
            {
                var start = property.charAt(0) == '_' ? 1 : 0;

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

        // Remove all @accessors or we will get a recursive loop in infinity
        var b = getterSetterBuffer.toString().replace(/@accessors(\(.*\))?/g, "");
        var imBuffer = exports.compileToIMBuffer(b, "Accessors", this.options);

        // Add the accessors methods first to instance method buffer.
        // This will allow manually added set and get methods to override the compiler generated
        compiler.imBuffer.concat(imBuffer);
    }

    // We will store the classDef first after accessors are done so we don't get a duplicate class error
    compiler.classDefs[className] = classDef;

    var bodies = node.body,
        bodyLength = bodies.length;

    if (bodyLength > 0)
    {
        if (!generate) compiler.lastPos = bodies[0].start;

        // And last add methods and other statements
        for (var i = 0; i < bodyLength; ++i) {
            var body = bodies[i];
            c(body, classScope, "Statement");
        }
        if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, body.end));
    }

    // We must make a new class object for our class definition if it's not a category
    if (!isInterfaceDeclaration && !node.categoryname) {
        saveJSBuffer.concat("objj_registerClassPair(the_class);\n");
    }

    // Add instance methods
    if (compiler.imBuffer.isEmpty())
    {
        saveJSBuffer.concat("class_addMethods(the_class, [");
        saveJSBuffer.appendStringBuffer(compiler.imBuffer);
        saveJSBuffer.concat("]);\n");
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty())
    {
        saveJSBuffer.concat("class_addMethods(meta_class, [");
        saveJSBuffer.appendStringBuffer(compiler.cmBuffer);
        saveJSBuffer.concat("]);\n");
    }

    saveJSBuffer.concat("}");

    compiler.jsBuffer = saveJSBuffer;

    // Skip the "@end"
    if (!generate) compiler.lastPos = node.end;

    // If the class conforms to protocols check that all required methods are implemented
    if (protocols)
    {
        // Lookup the protocolDefs for the protocols
        var protocolDefs = [];

        for (var i = 0, size = protocols.length; i < size; i++)
            protocolDefs.push(compiler.getProtocolDef(protocols[i].name));

        var unimplementedMethods = classDef.listOfNotImplementedMethodsForProtocols(protocolDefs);

        if (unimplementedMethods && unimplementedMethods.length > 0)
            for (var i = 0, size = unimplementedMethods.length; i < size; i++) {
                var unimplementedMethod = unimplementedMethods[i],
                    methodDef = unimplementedMethod.methodDef,
                    protocolDef = unimplementedMethod.protocolDef;

                compiler.addWarning(createMessage("Method '" + methodDef.name + "' in protocol '" + protocolDef.name + "' is not implemented", node.classname, compiler.source));
            }
    }
},
ProtocolDeclarationStatement: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer,
        protocolName = node.protocolname.name,
        protocolDef = compiler.getProtocolDef(protocolName),
        protocols = node.protocols,
        protocolScope = new Scope(st),
        inheritFromProtocols = [];

    if (protocolDef)
        throw compiler.error_message("Duplicate protocol " + protocolName, node.protocolName);

    compiler.imBuffer = new StringBuffer();
    compiler.cmBuffer = new StringBuffer();

    if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    buffer.concat("{var the_protocol = objc_allocateProtocol(\"" + protocolName + "\");", node);

    if (protocols) for (var i = 0, size = protocols.length; i < size; i++)
    {
        var protocol = protocols[i],
            inheritFromProtocolName = protocol.name;
            inheritProtocolDef = compiler.getProtocolDef(inheritFromProtocolName);

        if (!inheritProtocolDef)
            throw compiler.error_message("Can't find protocol " + inheritFromProtocolName, protocol);

        buffer.concat("\nvar aProtocol = objj_getProtocol(\"" + inheritFromProtocolName + "\");", node);
        buffer.concat("\nif (!aProtocol) throw new SyntaxError(\"*** Could not find definition for protocol \\\"" + protocolName + "\\\"\");", node);
        buffer.concat("\nprotocol_addProtocol(the_protocol, aProtocol);", node);
        inheritFromProtocols.push(inheritProtocolDef);
    }

    protocolDef = new ProtocolDef(protocolName, inheritFromProtocols);
    compiler.protocolDefs[protocolName] = protocolDef;
    protocolScope.protocolDef = protocolDef;

    var someRequired = node.required,
        requiredLength = someRequired.length;

    if (requiredLength > 0)
    {
        // We only add the required methods
        for (var i = 0; i < requiredLength; ++i) {
            var required = someRequired[i];
            if (!generate) compiler.lastPos = required.start;
            c(required, protocolScope, "Statement");
        }
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, required.end));
    }

    buffer.concat("\nobjc_registerProtocol(the_protocol);\n");

    // Add instance methods
    if (compiler.imBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
        buffer.atoms.push.apply(buffer.atoms, compiler.imBuffer.atoms); // FIXME: Move this append to StringBuffer
        buffer.concat("], true, false);\n");
    }

    // Add class methods
    if (compiler.cmBuffer.isEmpty())
    {
        buffer.concat("protocol_addMethodDescriptions(the_protocol, [");
        buffer.atoms.push.apply(buffer.atoms, compiler.cmBuffer.atoms); // FIXME: Move this append to StringBuffer
        buffer.concat("], true, true);\n");
    }

    buffer.concat("}");

    compiler.jsBuffer = buffer;

    // Skip the "@end"
    if (!generate) compiler.lastPos = node.end;
},
MethodDeclarationStatement: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new Scope(st),
        isInstanceMethodType = node.methodtype === '-',
        selectors = node.selectors,
        nodeArguments = node.arguments,
        returnType = node.returntype,
        types = [returnType ? returnType.name : "id"],
        returnTypeProtocols = returnType ? returnType.protocols : null,
        selector = selectors[0].name;    // There is always at least one selector

    if (returnTypeProtocols) for (var i = 0, size = returnTypeProtocols.length; i < size; i++) {
        var returnTypeProtocol = returnTypeProtocols[i];
        if (!compiler.getProtocolDef(returnTypeProtocol.name)) {
            compiler.addWarning(createMessage("Cannot find protocol declaration for '" + returnTypeProtocol.name + "'", returnTypeProtocol, compiler.source));
        }
    }

    if (!generate) saveJSBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));

    compiler.jsBuffer = isInstanceMethodType ? compiler.imBuffer : compiler.cmBuffer;

    // Put together the selector. Maybe this should be done in the parser...
    for (var i = 0; i < nodeArguments.length; i++) {
        var argument = nodeArguments[i],
            argumentType = argument.type,
            argumentTypeName = argumentType ? argumentType.name : "id",
            argumentProtocols = argumentType ? argumentType.protocols : null;

        types.push(argumentType ? argumentType.name : "id");

        if (argumentProtocols) for (var i = 0, size = argumentProtocols.length; i < size; i++) {
            var argumentProtocol = argumentProtocols[i];
            if (!compiler.getProtocolDef(argumentProtocol.name)) {
                compiler.addWarning(createMessage("Cannot find protocol declaration for '" + argumentProtocol.name + "'", argumentProtocol, compiler.source));
            }
        }

        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";
    }

    if (compiler.jsBuffer.isEmpty())           // Add comma separator if this is not first method in this buffer
        compiler.jsBuffer.concat(", ");

    compiler.jsBuffer.concat("new objj_method(sel_getUid(\"", node);
    compiler.jsBuffer.concat(selector);
    compiler.jsBuffer.concat("\"), ");

    if (node.body) {
        compiler.jsBuffer.concat("function");

        if (compiler.options.includeMethodFunctionNames)
        {
            compiler.jsBuffer.concat(" $" + st.currentClassName() + "__" + selector.replace(/:/g, "_"));
        }

        compiler.jsBuffer.concat("(self, _cmd");

        methodScope.methodType = node.methodtype;
        if (nodeArguments) for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i],
                argumentName = argument.identifier.name;

            compiler.jsBuffer.concat(", ");
            compiler.jsBuffer.concat(argumentName, argument.identifier);
            methodScope.vars[argumentName] = {type: "method argument", node: argument};
        }

        compiler.jsBuffer.concat(")\n");

        if (!generate) compiler.lastPos = node.startOfBody;
        indentation += indentStep;
        c(node.body, methodScope, "Statement");
        indentation = indentation.substring(indentationSize);
        if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.body.end));

        compiler.jsBuffer.concat("\n");
    } else { // It is a interface or protocol declatartion and we don't have a method implementation
        compiler.jsBuffer.concat("Nil\n");
    }

    if (compiler.options.includeMethodArgumentTypeSignatures)
        compiler.jsBuffer.concat(","+JSON.stringify(types));
    compiler.jsBuffer.concat(")");
    compiler.jsBuffer = saveJSBuffer;
    if (!generate) compiler.lastPos = node.end;

    // Add the method to the class or protocol definition
    var def = st.classDef,
        alreadyDeclared;

    // But first, if it is a class definition check if it is declared in superclass or interface declaration
    if (def)
        alreadyDeclared = isInstanceMethodType ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
    else
        def = st.protocolDef;

    if (!def)
        throw "InternalError: MethodDeclaration without ClassDeclaration or ProtocolDeclaration at line: " + exports.acorn.getLineInfo(compiler.source, node.start).line;

    // Create warnings if types does not corresponds to method declaration in superclass or interface declarations
    // If we don't find the method in superclass or interface declarations above or if it is a protocol 
    // declaration, try to find it in any of the conforming protocols
    if (!alreadyDeclared) {
        var protocols = def.protocols;

        if (protocols) for (var i = 0, size = protocols.length; i < size; i++) {
            var protocol = protocols[i],
                alreadyDeclared = isInstanceMethodType ? protocol.getInstanceMethod(selector) : protocol.getClassMethod(selector);

            if (alreadyDeclared)
                break;
        }
    }

    if (alreadyDeclared) {
        var declaredTypes = alreadyDeclared.types;

        if (declaredTypes) {
            var typeSize = declaredTypes.length;
            if (typeSize > 0) {
                // First type is return type
                var returnType = declaredTypes[0];

                if (returnType !== types[0])
                    compiler.addWarning(createMessage("Conflicting return type in implementation of '" + selector + "': '" + returnType + "' vs '" + types[0] + "'", node.returntype || node, compiler.source));

                // Check the parameter types. The size of the two type arrays should be the same
                for (var i = 1; i < typeSize; i++) {
                    var parameterType = declaredTypes[i];

                    if (parameterType !== types[i])
                        compiler.addWarning(createMessage("Conflicting parameter types in implementation of '" + selector + "': '" + parameterType + "' vs '" + types[i] + "'", node.arguments[i - 1].type || node.arguments[i - 1].identifier, compiler.source));
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
MessageSendExpression: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate,
        buffer = compiler.jsBuffer;
    if (!generate) {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.object ? node.object.start : node.arguments.length ? node.arguments[0].start : node.end;
    }
    if (node.superObject)
    {
        if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        buffer.concat("objj_msgSendSuper(", node);
        buffer.concat("{ receiver:self, super_class:" + (st.currentMethodType() === "+" ? compiler.currentSuperMetaClass : compiler.currentSuperClass ) + " }");
    }
    else
    {
        if (!generate) buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
        buffer.concat("objj_msgSend(", node);
        c(node.object, st, "Expression");
        if (!generate) buffer.concat(compiler.source.substring(compiler.lastPos, node.object.end));
    }

    var selectors = node.selectors,
        nodeArguments = node.arguments,
        firstSelector = selectors[0],
        selector = firstSelector ? firstSelector.name : "";    // There is always at least one selector

    // Put together the selector. Maybe this should be done in the parser...
    for (var i = 0; i < nodeArguments.length; i++)
        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";

    buffer.concat(", \"");
    buffer.concat(selector); // FIXME: sel_getUid(selector + "") ? This FIXME is from the old preprocessor compiler
    buffer.concat("\"");

    if (nodeArguments) for (var i = 0; i < nodeArguments.length; i++)
    {
        var argument = nodeArguments[i];

        buffer.concat(", ");
        if (!generate)
            compiler.lastPos = argument.start;
        c(argument, st, "Expression");
        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, argument.end));
            compiler.lastPos = argument.end;
        }
    }

    // TODO: Move this 'if' with body up inside the node.argument 'if'
    if (node.parameters) for (var i = 0; i < node.parameters.length; ++i)
    {
        var parameter = node.parameters[i];

        buffer.concat(", ");
        if (!generate)
            compiler.lastPos = parameter.start;
        c(parameter, st, "Expression");
        if (!generate) {
            buffer.concat(compiler.source.substring(compiler.lastPos, parameter.end));
            compiler.lastPos = parameter.end;
        }
    }

    buffer.concat(")");
    if (!generate) compiler.lastPos = node.end;
},
SelectorLiteralExpression: function(node, st, c) {
    var compiler = st.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate;
    if (!generate) {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(" "); // Add an extra space if it looks something like this: "return(@selector(a:))". No space between return and expression.
    }
    buffer.concat("sel_getUid(\"", node);
    buffer.concat(node.selector);
    buffer.concat("\")");
    if (!generate) compiler.lastPos = node.end;
},
ProtocolLiteralExpression: function(node, st, c) {
    var compiler = st.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate;
    if (!generate) {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(" "); // Add an extra space if it looks something like this: "return(@protocol(a))". No space between return and expression.
    }
    buffer.concat("objj_getProtocol(\"", node);
    c(node.id, st, "IdentifierName");
    buffer.concat("\")");
    if (!generate) compiler.lastPos = node.end;
},
Reference: function(node, st, c) {
    var compiler = st.compiler,
        buffer = compiler.jsBuffer,
        generate = compiler.generate;
    if (!generate) {
        buffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        buffer.concat(" "); // Add an extra space if it looks something like this: "return(<expression>)". No space between return and expression.
    }
    buffer.concat("function(__input) { if (arguments.length) return ", node);
    buffer.concat(node.element.name);
    buffer.concat(" = __input; return ");
    buffer.concat(node.element.name);
    buffer.concat("; }");
    if (!generate) compiler.lastPos = node.end;
},
Dereference: function(node, st, c) {
    var compiler = st.compiler,
        generate = compiler.generate;

    checkCanDereference(st, node.expr);

    // @deref(y) -> y()
    // @deref(@deref(y)) -> y()()
    if (!generate) {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.expr.start;
    }
    c(node.expr, st, "Expression");
    if (!generate) compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.expr.end));
    compiler.jsBuffer.concat("()");
    if (!generate) compiler.lastPos = node.end;
},
ClassStatement: function(node, st, c) {
    var compiler = st.compiler;
    if (!compiler.generate) {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
        compiler.jsBuffer.concat("//");
    }
    var className = node.id.name;
    if (!compiler.getClassDef(className)) {
        classDef = new ClassDef(false, className);
        compiler.classDefs[className] = classDef;
    }
    st.vars[node.id.name] = {type: "class", node: node.id};
},
GlobalStatement: function(node, st, c) {
    var compiler = st.compiler;
    if (!compiler.generate) {
        compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
        compiler.lastPos = node.start;
        compiler.jsBuffer.concat("//");
    }
    st.rootScope().vars[node.id.name] = {type: "global", node: node.id};
},
PreprocessStatement: function(node, st, c) {
    var compiler = st.compiler;
    if (!compiler.generate) {
      compiler.jsBuffer.concat(compiler.source.substring(compiler.lastPos, node.start));
      compiler.lastPos = node.start;
      compiler.jsBuffer.concat("//");
    }
}
});

});
