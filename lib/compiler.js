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

var acorn = require("objj-acorn"),
    exceptions = require("./exceptions"),
    language = require("./language"),
    ClassDef = language.ClassDef,
    ClassDefTypes = language.ClassDefTypes,
    formats = require("./formats"),
    indentation = require("./indentation"),
    MethodDef = language.MethodDef,
    path = require("path"),
    Scope = require("./scope"),
    StringBuffer = require("./stringbuffer"),
    util = require("util");

exports.version = "1.0.0-beta";
exports.acorn = acorn;

var isLogicalOrBinaryExpression = acorn.makePredicate("LogicalExpression BinaryExpression");

// Options may be passed to further configure the compiler. These options are recognized:

var defaultOptions = {
    // Acorn (parser) options. For more information see objj-acorn.
    // We use a function here to create a new object every time we copy the default options.
    acornOptions: function() { return Object.create(null); },

    // If true, generates a source map for the compiled file.
    sourceMap: false,

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

    // The maximum number of errors that can occur before compilation is aborted.
    maxErrors: 20,

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

function setupOptions(options)
{
    options = options || {};

    var newOptions = {};

    for (var option in defaultOptions)
    {
        if (options.hasOwnProperty(option))
            newOptions[option] = options[option];
        else
        {
            var defaultOption = defaultOptions[option];
            newOptions[option] = typeof defaultOption === "function" ? defaultOption() : defaultOption;
        }
    }

    return newOptions;
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

function isIdempotentExpression(node)
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
}

var Compiler = function(/* String */ source, /* String */ sourcePath, /* Mozilla SpiderMonkey AST */ ast, options)  // jshint ignore:line
{
    this.source = source;
    this.sourcePath = sourcePath;
    this.AST = ast;
    options = setupOptions(options);
    this.options = options;
    this.classDefs = options.classDefs;
    this.protocolDefs = options.protocolDefs;
    this.format = typeof options.format === "string" ? formats.load(options.format) : options.format;
    this.jsBuffer = new StringBuffer(this.options.sourceMap, sourcePath);
    this.imBuffer = null;
    this.cmBuffer = null;
    this.dependencies = [];
    this.issues = [];
    this.errorCount = 0;
    this.lastPos = 0;
    this.importStack = Compiler.importStack;
};

exports.Compiler = Compiler;

Compiler.importStack = [];

// Returns true if subnode has higher precedence than node.
// If subnode is the right subnode of a binary expression, right is true.
Compiler.prototype.subnodeHasPrecedence = function(node, subnode, right)
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

        return (
            subnodeOperatorPrecedence > nodeOperatorPrecedence ||
            (right === true && nodeOperatorPrecedence === subnodeOperatorPrecedence)
        );
    }

    return false;
};

Compiler.prototype.createClass = function(node, name, superclassNode, ivars, instanceMethods, classMethods, protocols)
{
    // To be an @implementation declaration it must have method and ivar dictionaries.
    // Otherwise it's a @class declaration.

    var type = ivars ? ClassDefTypes.implementation : ClassDefTypes.class,
        classDef = this.getClassDef(name);

    if (classDef && type === ClassDefTypes.implementation)
    {
        this.addError(node.classname, "reimplementation of class '%s'", name);

        // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
        this.addNote(classDef.node.classname, "previous definition is here");
    }

    var superclassDef = superclassNode ? this.getClassDef(superclassNode.name) : null;

    if (superclassNode && !superclassDef)
        this.addError(
            superclassNode,
            "cannot find implementation declaration for '%s', superclass of '%s'",
            superclassNode.name,
            name
        );

    return new ClassDef(node, name, superclassNode, superclassDef, ivars, instanceMethods, classMethods, protocols);
};

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

Compiler.prototype.concatParenthesizedExpression = function(node, scope, compileNode, nodeToCompile)
{
    var buffer = this.jsBuffer;

    buffer.concatLeftParens(node, scope);
    compileNode(nodeToCompile || node, scope, "Expression");
    buffer.concatRightParens(node, scope);
};

Compiler.prototype.concatPrecedenceExpression = function(node, subnode, scope, compileNode, right)
{
    if (this.subnodeHasPrecedence(node, subnode, right))
        this.concatParenthesizedExpression(subnode, scope, compileNode);
    else
        compileNode(subnode, scope, "Expression");
};

/*
    We do not allow dereferencing of expressions with side effects because
    we might need to evaluate the expression twice in certain uses of deref,
    which is not obvious when you look at the deref operator in plain code.
*/
Compiler.prototype.checkCanDereference = function(scope, node)
{
    if (!isIdempotentExpression(node))
        this.addError(node, "dereference expressions may not have side effects");
};

// Helper for codeGenerator.MethodDeclaration
Compiler.prototype.makeSelector = function(scope, compileNode, nodeArguments, types, selectors)  // -> selector
{
    var selector = selectors[0].name;

    if (nodeArguments.length > 0)
    {
        for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i],
                argumentType = argument.type,
                argumentTypeName = argumentType ? argumentType.name : "id",
                argumentProtocols = argumentType ? argumentType.protocols : null,
                argumentProtocol, j;

            types.push(argumentTypeName);

            if (i === 0)
                selector += ":";
            else
                selector += (selectors[i] ? selectors[i].name : "") + ":";

            if (argumentProtocols)
            {
                for (j = 0; j < argumentProtocols.length; j++)
                {
                    argumentProtocol = argumentProtocols[j];

                    if (!this.getProtocolDef(argumentProtocol.name))
                        this.addWarning(argumentProtocol, "undefined protocol: '%s'", argumentProtocol.name);
                }
            }
        }
    }

    return selector;
};

Compiler.prototype.addIssue = function(Class, node, args)
{
    var issue;

    if (arguments.length > 1)
    {
        var messageArgs = Array.prototype.slice.call(args, 1);

        issue = new Class(
            this.source,
            this.getRelativeSourcePath(),
            node,
            util.format.apply(this, messageArgs)
        );
    }
    else
        issue = Class;

    this.issues.push(issue);
};

Compiler.prototype.addNote = function(node)
{
    return this.addIssue(exceptions.CompilerNote, node, arguments);
};

Compiler.prototype.addWarning = function(node)
{
    return this.addIssue(exceptions.CompilerWarning, node, arguments);
};

Compiler.prototype.addError = function(node)
{
    ++this.errorCount;

    if (this.errorCount > this.options.maxErrors)
        throw new exceptions.TooManyErrors(this.options.maxErrors);

    return this.addIssue(exceptions.CompilerError, node, arguments);
};

Compiler.prototype.addInternalError = function(node)
{
    this.addError.apply(this, arguments);
    throw exceptions.InternalError();
};

Compiler.prototype.addIssueHighlight = function(node)
{
    this.issues.last().addHighlight(node);
};

Compiler.prototype.addIssueHighlights = function(nodes)
{
    nodes.forEach(function(node) { this.addIssueHighlight(node); }, this);
};

Compiler.prototype.getErrorCount = function()
{
    return this.errorCount;
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

        classDef = classDef.superclass;
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

    /*
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
                superclass = class_getSuperclass(klass);

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

            superclass = superclass ? superclass.name : null;

            classDef = this.createClass(
                node, name, superclass,
                myIvars, instanceMethodDefs, classMethodDefs, myProtocols);

            this.classDefs[name] = classDef;
        }
    }
    */

    return classDef;
};

Compiler.prototype.getProtocolDef = function(/* String */ name)
{
    if (!name)
        return null;

    var protocolDef = this.protocolDefs[name] || null;

    if (protocolDef)
        return protocolDef;

    /*
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
                for (var i = 0; i < protocols.length; i++)
                    inheritedProtocols.push(this.getProtocolDef(protocols[i].name));
            }

            protocolDef = new ProtocolDef(protocolName, inheritedProtocols, requiredInstanceMethodDefs, requiredClassMethodDefs);
            this.protocolDefs[name] = protocolDef;
        }
    }
    */

    return protocolDef;
};

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.checkProtocolConformance = function(node, classDef, protocols)
{
    for (var i = 0; i < protocols.length; i++)
    {
        var protocol = protocols[i],
            protocolDef = this.getProtocolDef(protocol.name),
            unimplementedMethods = classDef.unimplementedMethodsForProtocol(protocolDef);

        if (unimplementedMethods.length > 0)
        {
            for (var j = 0; j < unimplementedMethods.length; j++)
            {
                var unimplementedMethod = unimplementedMethods[j],
                    methodDef = unimplementedMethod.methodDef,
                    protocolDef = unimplementedMethod.protocolDef;

                this.addWarning(node.classname, "method '%s' in protocol '%s' not implemented", methodDef.name, protocolDef.name);
                this.addIssueHighlight(protocol);
                this.addNote(methodDef.node, "method '%s' declared here", methodDef.name);
            }
        }
    }
};

/*
Compiler.methodDefsFromMethodList = function(methodList)
{
    var myMethods = Object.create(null);

    for (var i = 0; i < methodList.length; i++)
    {
        var method = methodList[i],
            methodName = method_getName(method);

        myMethods[methodName] = new MethodDef(methodName, method.types);
    }

    return myMethods;
};
*/

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.declareClass = function(node)  // -> classDef
{
    var buffer = this.jsBuffer,
        className = node.classname.name,
        comment,
        classDef;

    if (node.categoryname)
    {
        var category = node.categoryname.name;
        comment = util.format("@implementation %s (%s)", className, category);
        buffer.concat(
            ClassDef.categoryTemplate(
            {
                comment: comment,
                "class": className,
                category: category
            }).indent(),
            node);
    }
    else
    {
        classDef = this.createClass(node, className, node.superclassname, Object.create(null));

        var superclass = node.superclassname ? node.superclassname.name : null,
            inheritFrom = superclass ? " : " + superclass : "",
            protocols = node.protocols,
            protocolList = [];

        if (protocols)
        {
            for (var i = 0; i < protocols.length; i++)
                protocolList.push(protocols[i].name);

            protocols = " <" + protocolList.join(", ") + ">";
        }
        else
            protocols = "";

        comment = util.format("@implementation %s%s%s", className, inheritFrom, protocols);
        buffer.concat(
            ClassDef.declarationTemplate(
            {
                comment: comment,
                "class": className,
                superclass: superclass || "Nil",
                inheritFrom: inheritFrom
            }),
            node);
    }

    return { classDef: classDef, comment: comment };
};

Compiler.prototype.getAccessorInfo = function(accessors, ivarName)
{
    var property = (accessors.property && accessors.property.name) || ivarName;

    if (property.charAt(0) === "_")
        property = property.substring(1);

    var getter = (accessors.getter && accessors.getter.name) || property;

    return { property: property, getter: getter };
};

Compiler.prototype.findIvar = function(name, classDef)  // -> { ivar: node, className: String }
{
    var ivars = classDef.ivars;

    while (ivars)
    {
        var ivar = ivars[name];

        if (ivar)
            return { ivar: ivar.node, className: classDef.node.classname.name };

        var superclass = classDef.superclassDef;

        if (superclass)
        {
            classDef = this.getClassDef(superclass.name);

            if (classDef)
                ivars = classDef.ivars;
            else
                return null;
        }
        else
            return null;
    }

    return null;
};

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.addIvars = function(node, compileNode, scope, classDef, classScope)  // -> hasAccessors
{
    var buffer = this.jsBuffer,
        hasAccessors = false;

    buffer.concat("\n\nclass_addIvars($the_class,\n[");
    indentation.indent();

    for (var i = 0; i < node.ivardeclarations.length; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarType = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarIdentifier = ivarDecl.id,
            ivarName = ivarIdentifier.name,
            ivars = classDef.ivars,
            ivar = { type: ivarType, name: ivarName, node: ivarDecl },
            accessors = ivarDecl.accessors,
            previousDeclaration = this.findIvar(ivarName, classDef);

        if (previousDeclaration)
        {
            scope.compiler.addWarning(
                ivarIdentifier,
                "redeclaration of instance variable '%s' in class '%s'",
                ivarName,
                node.classname.name
            );

            scope.compiler.addNote(
                previousDeclaration.ivar,
                "previous declaration is here, in class '%s'",
                previousDeclaration.className
            );
        }

        buffer.concat(util.format("\nnew objj_ivar(\"%s\"".indent(), ivarName), node);

        if (this.options.generateIvarTypeSignatures)
            buffer.concat(util.format(", \"%s\"", ivarType));

        buffer.concat("),");

        if (ivarDecl.outlet)
            ivar.outlet = true;

        ivars[ivarName] = ivar;

        if (!classScope.ivars)
            classScope.ivars = Object.create(null);

        classScope.ivars[ivarName] = { type: "ivar", name: ivarName, node: ivarIdentifier, ivar: ivar };

        if (accessors)
            hasAccessors = true;
    }

    if (node.ivardeclarations.length > 0)
    {
        indentation.dedent();
        buffer.concat("\n]);");
    }

    return hasAccessors;
};

Compiler.prototype.checkForShadowedIvar = function(scope, identifier)
{
    var addedSelfToIvar = scope.ivarRefs[identifier];

    if (addedSelfToIvar)
    {
        var atoms = this.jsBuffer.atoms;

        for (var i = 0; i < addedSelfToIvar.length; i++)
        {
            var dict = addedSelfToIvar[i];

            atoms[dict.index] = "";
            this.addWarning(dict.node, "local declaration of '%s' hides instance variable", identifier);
        }

        scope.ivarRefs[identifier] = [];
    }
};

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.generateAccessors = function(node, classDef)  // -> accessors
{
    var buffer = this.jsBuffer,
        havePreviousAccessors = false;

    indentation.indent();

    for (var i = 0; i < node.ivardeclarations.length; i++)
    {
        var ivar = node.ivardeclarations[i],
            accessors = ivar.accessors;

        if (!accessors)
            continue;

        var ivarType = ivar.ivartype ? ivar.ivartype.name : null,
            ivarName = ivar.id.name,
            info = this.getAccessorInfo(accessors, ivarName),
            selector = info.getter;

        if (!classDef.getInstanceMethod(selector))
        {
            classDef.addInstanceMethod(new MethodDef(selector, [ivarType]));

            var getterCode = havePreviousAccessors ? "\n" : "";

            getterCode += ClassDef.getterTemplate(
                {
                    readonly: accessors.readonly ? "readonly, " : "",
                    selector: selector,
                    "class": classDef.name,
                    ivar: ivarName,
                    returnType: ivarType
                }).indent();

            buffer.concat(getterCode, node);
            havePreviousAccessors = true;
        }

        if (accessors.readonly)
            continue;

        var property = info.property,

        selector = accessors.setter ? accessors.setter.name : null;

        if (!selector)
            selector = util.format("set%s:", property.capitalize());

        if (classDef.getInstanceMethod(selector))
            continue;

        classDef.addInstanceMethod(new MethodDef(selector, ["void", ivarType]));

        var code;

        if (accessors.copy)
            code = ClassDef.setterCopyTemplate({ ivar: ivarName }).indent();
        else
            code = util.format("self.%s = newValue;", ivarName).indent();

        var setterCode = havePreviousAccessors ? "\n" : "";

        setterCode += ClassDef.setterTemplate({
                setter: selector.slice(0, -1),  // trim trailing :
                selector: selector,
                "class": classDef.name,
                code: code,
                returnType: ivarType ? ivarType : "id"
            }).indent();

        buffer.concat(setterCode, node);
        havePreviousAccessors = true;
    }

    indentation.dedent();
};

// Helper for codeGenerator.MethodDeclaration
Compiler.prototype.compileMethod = function(node, scope, compileNode, methodScope, nodeArguments, types)
{
    indentation.indent();

    var selector = this.makeSelector(scope, compileNode, nodeArguments, types, node.selectors),
        buffer = this.jsBuffer,
        declaration = buffer.isEmpty() ? "" : "\n";

    buffer.concat(declaration + MethodDef.declarationTemplate({ selector: selector, type: node.methodtype }).indent(), node);

    if (node.body)
    {
        buffer.concat("\nfunction".indent());

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

        buffer.concat(")");

        compileNode(node.body, methodScope, "Statement");
    }
    else
        buffer.concat(" Nil");

    if (this.options.generateMethodArgumentTypeSignatures)
    {
        var signatures = types.map(function(type)
            {
                return "\"" + type + "\"";
            }).join(", ");

        buffer.concat("\n" + ("// argument types\n, [" + signatures + "]").indent());
    }

    buffer.concat("),");
    indentation.dedent();

    return selector;
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

Compiler.prototype.getAST = function()
{
    return JSON.stringify(this.AST, null, indentation.indentWidth);
};

Compiler.prototype.getSourceMap = function()
{
    return JSON.stringify(this.sourceMap);
};

Compiler.prototype.getIssues = function()
{
    return this.issues;
};

Compiler.prototype.getRelativeSourcePath = function(sourcePath)
{
    sourcePath = sourcePath || this.sourcePath;

    if (sourcePath === this.sourcePath)
        return path.basename(sourcePath);

    return path.relative(sourcePath, this.sourcePath);
};

Compiler.prototype.pushImport = function(url)
{
    // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.
    this.importStack.push(url);
};

Compiler.prototype.popImport = function()
{
    this.importStack.pop();
};

Compiler.prototype.compileWithFormat = function(visitor)  // jshint ignore:line
{
    var includeComments = this.options.includeComments,
        lastNode,
        lastComment;

    var compileNode = function(node, scope)
    {
        var buffer = scope.compiler.jsBuffer,
            localLastNode = lastNode,
            sameNode = localLastNode === node;

        lastNode = node;

        if (includeComments && !sameNode && node.commentsBefore && node.commentsBefore !== lastComment)
        {
            for (var i = 0; i < node.commentsBefore.length; i++)
                buffer.concat(node.commentsBefore[i]);
        }

        scope.pushNode(node);

        if (!sameNode)
            buffer.concatFormat(node, scope, "before");

        visitor[node.type](node, scope, compileNode);

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

    compileNode(this.AST, new Scope(null, { compiler: this }));

    if (this.options.sourceMap)
    {
        var s = this.jsBuffer.toString();
        this.compiledCode = s.code;
        this.sourceMap = s.map;
    }
    else
        this.compiledCode = this.jsBuffer.toString();
};
