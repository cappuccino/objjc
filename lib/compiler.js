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
    chalk = require("chalk"),
    exceptions = require("./exceptions"),
    globals = require("./globals"),
    language = require("./language"),
    formats = require("./formats"),
    indentation = require("./indentation"),
    path = require("path"),
    Scope = require("./scope").Scope,
    StringBuffer = require("./stringbuffer"),
    util = require("util");

require("./utils");  // for Object properties, don't need the module

var ClassDef = language.ClassDef,
    MethodDef = language.MethodDef;

exports.version = "1.0.0-beta";
exports.acorn = acorn;

var isLogicalOrBinaryExpression = acorn.makePredicate("LogicalExpression BinaryExpression");

// Options may be passed to further configure the compiler. These options are recognized:

exports.defaultOptions = {
    // Acorn (parser) options. For more information see objj-acorn.
    // We use a function here to create a new object every time we copy the default options.
    acornOptions: function() { return Object.create(null); },

    // If true, generates a source map for the compiled file.
    sourceMap: false,

    // A URL to the root directory of the source files, used by the source map.
    sourceRoot: ".",

    // Pass in class definitions. New class definitions in the source file will be added to this when compiling.
    classDefs: function() { return Object.create(null); },

    // Pass in protocol definitions. New protocol definitions in the source file will be added to this when compiling.
    protocolDefs: function() { return Object.create(null); },

    // Pass in typedef definitions. New typedef definitions in the source file will be added to this when compiling.
    typedefs: function() { return Object.create(null); },

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

    // The environment in which the code is expected to run.
    // This determines the set of predefined globals.
    environment: "browser",

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
    generateIvarTypeSignatures: true,

    // Supported compiler warnings and their default values.
    warnings: {
        "debugger": true,
        "shadowed-vars": true,
        "implicit-globals": true,
        "unknown-identifiers": true,
        "parameter-types": false,
        "unknown-types": true
    }
};

function setupWarnings(/* Array */ warnings)
{
    var result = Object.create(null),
        warningMode = "none";

    Object.merge(result, exports.defaultOptions.warnings);

    warnings.every(function(warning)
    {
        var value = true;

        if (warning === "all" || warning === "none")
        {
            value = warning === "all";

            Object.keys(result).forEach(function(key)
            {
                result[key] = value;
            });

            return false;  // abort every()
        }

        //noinspection IfStatementWithTooManyBranchesJS
        if (warning.startsWith("no-"))
        {
            if (warningMode === "set")
            {
                warningMode = "mixed";
            }
            else
            {
                warning = warning.substring("no-".length);
                value = false;
                warningMode = "exclusive";
            }
        }
        else if (warning.startsWith("+"))
        {
            if (warningMode === "set")
            {
                warningMode = "mixed";
            }
            else
            {
                warning = warning.substring(1);
                value = true;
                warningMode = "inclusive";
            }
        }
        else if (warningMode === "none")
        {
            // On the first "set" warning, reset all to false
            Object.keys(result).forEach(function(key)
            {
                result[key] = false;
            });

            warningMode = "set";
        }
        else if (warningMode !== "set")
        {
            warningMode = "mixed";
        }

        if (warningMode === "mixed")
        {
            console.warn("objjc: " + chalk.yellow("warning: ") + chalk.gray("listing specific compiler warnings may not be mixed with inclusive/exclusive warnings"));
            return false;  // abort every()
        }

        if (exports.defaultOptions.warnings.hasOwnProperty(warning))
            result[warning] = value;
        else
            console.warn("objjc: " + chalk.yellow("warning: ") + chalk.gray("unknown compiler warning '%s'"), warning);

        return true;
    });

    return result;
}

function setupOptions(options)
{
    options = options || {};

    var newOptions = {};

    for (var option in exports.defaultOptions)
    {
        if (options.hasOwnProperty(option))
        {
            if (option === "warnings" && Array.isArray(options.warnings))
                newOptions[option] = setupWarnings(options.warnings);
            else
                newOptions[option] = options[option];
        }
        else
        {
            var defaultOption = exports.defaultOptions[option];
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
    var result,
        i;

    switch (node.type)
    {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (i = 0; i < node.elements.length; i++)
            {
                if (!isIdempotentExpression(node.elements[i]))
                    return false;
            }

            return true;

        case "DictionaryLiteral":
            for (i = 0; i < node.keys.length; i++)
            {
                if (!isIdempotentExpression(node.keys[i]))
                    return false;

                if (!isIdempotentExpression(node.values[i]))
                    return false;
            }

            return true;

        case "ObjectExpression":
            for (i = 0; i < node.properties.length; i++)
                if (!isIdempotentExpression(node.properties[i].value))
                    return false;

            return true;

        case "FunctionExpression":
            for (i = 0; i < node.params.length; i++)
                if (!isIdempotentExpression(node.params[i]))
                    return false;

            return true;

        case "SequenceExpression":
            for (i = 0; i < node.expressions.length; i++)
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

var Compiler = function(source, sourcePath, destPath, ast, options)
{
    this.source = source;
    this.sourcePath = sourcePath;
    this.destPath = destPath;
    this.AST = ast;
    options = setupOptions(options);
    this.options = options;
    this.classDefs = options.classDefs;
    this.typedefs = options.typedefs;
    this.protocolDefs = options.protocolDefs;
    this.format = typeof options.format === "string" ? formats.load(options.format) : options.format;
    this.imBuffer = null;
    this.cmBuffer = null;
    this.initPredefinedGlobals();
    this.dependencies = [];
    this.importStack = Compiler.importStack;
    this.issues = [];
    this.errorCount = 0;
    this.lastPos = 0;
    this.jsBuffer = new StringBuffer(this);
    this.compiledCode = null;
};

exports.Compiler = Compiler;

Compiler.importStack = [];

Compiler.prototype.initPredefinedGlobals = function()
{
    this.predefinedGlobals = Object.create(null);
    Object.merge(this.predefinedGlobals, globals.reserved);
    Object.merge(this.predefinedGlobals, globals.nonstandard);
    Object.merge(this.predefinedGlobals, globals.ecmaIdentifiers);
    Object.merge(this.predefinedGlobals, globals.newEcmaIdentifiers);
    Object.merge(this.predefinedGlobals, globals[this.options.environment]);

    if (this.options.environment === "browser")
        Object.merge(this.predefinedGlobals, globals.devel);
};

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
    compileNode(nodeToCompile || node, scope);
    buffer.concatRightParens(node, scope);
};

Compiler.prototype.concatPrecedenceExpression = function(node, subnode, scope, compileNode, right)
{
    if (this.subnodeHasPrecedence(node, subnode, right))
        this.concatParenthesizedExpression(subnode, scope, compileNode);
    else
        compileNode(subnode, scope);
};

/*
    We do not allow dereferencing of expressions with side effects because
    we might need to evaluate the expression twice in certain uses of deref,
    which is not obvious when you look at the deref operator in plain code.
*/
Compiler.prototype.checkCanDereference = function(node)
{
    if (!isIdempotentExpression(node))
        this.addError(node, "dereference expressions may not have side effects");
};

// Helper for codeGenerator.MethodDeclaration
Compiler.prototype.makeSelector = function(scope, compileNode, nodeArguments, types, selectors)  // -> selector
{
    var selector = selectors[0].name;

    for (var i = 0; i < nodeArguments.length; i++)
    {
        var argument = nodeArguments[i],
            argumentType = argument.type,
            argumentProtocols = argumentType ? argumentType.protocols : null;

        types.push(argumentType ? argumentType.name : "id");

        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";

        if (argumentProtocols)
        {
            for (var j = 0; j < argumentProtocols.length; j++)
            {
                var argumentProtocol = argumentProtocols[j];

                if (!this.getProtocolDef(argumentProtocol.name))
                    this.addWarning(argumentProtocol, "cannot find protocol declaration for '%s'", argumentProtocol.name);
            }
        }
    }

    return selector;
};

Compiler.makeIssue = function(Class, source, sourcePath, node, args)
{
    var issue;

    if (arguments.length > 1)
    {
        issue = new Class(
            source,
            Compiler.getRelativeSourcePath(null, sourcePath),
            node,
            util.format.apply(this, args)
        );
    }
    else
        issue = Class;

    return issue;
};

Compiler.prototype.makeIssue = function(Class, node, args)
{
    return Compiler.makeIssue(
                Class,
                this.source,
                this.sourcePath,
                node,
                Array.prototype.slice.call(args, 1)
            );
};

Compiler.prototype.addIssue = function(Class, node, args)
{
    if (typeof args === "string")
        args = Array.prototype.slice.call(arguments, 1);

    this.issues.push(this.makeIssue(Class, node, args));
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

Compiler.prototype.addInternalError = function()
{
    this.addError.apply(this, arguments);
    throw new exceptions.InternalError();
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

Compiler.prototype.getIvarForClass = function(ivarName, scope)
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

        classDef = classDef.superclassDef;
    }

    return null;
};

Compiler.prototype.getClassDef = function(/* String */ name)
{
    if (!name)
        return null;

    return this.classDefs[name] || null;
};

function findDefinition(name, defs)
{
    name = name.toLowerCase();

    var names = Object.keys(defs);

    for (var i = 0; i < names.length; ++i)
    {
        if (name === names[i].toLowerCase())
            return defs[names[i]];
    }

    return null;
}

Compiler.prototype.findDef = function(/* String */ name)
{
    return (findDefinition(name, this.classDefs) || findDefinition(name, this.protocolDefs));
};

Compiler.prototype.getProtocolDef = function(/* String */ name)
{
    if (!name)
        return null;

    return this.protocolDefs[name] || null;
};

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.checkProtocolConformance = function(node, classDef, protocols)
{
    for (var i = 0; i < protocols.length; i++)
    {
        var protocol = protocols[i],
            protocolDef = this.getProtocolDef(protocol.name);

        if (!protocolDef)
            continue;

        var unimplementedMethods = classDef.unimplementedMethodsForProtocol(protocolDef);

        if (unimplementedMethods.length > 0)
        {
            for (var j = 0; j < unimplementedMethods.length; j++)
            {
                var unimplementedMethod = unimplementedMethods[j],
                    methodDef = unimplementedMethod.methodDef;

                this.addWarning(protocol, "method '%s' in protocol '%s' not implemented", methodDef.name, protocol.name);
                this.addNote(methodDef.node, "method '%s' declared here", methodDef.name);
            }
        }
    }
};

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
            }).indent()
        );
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
            {
                var protocolNode = protocols[i],
                    protocolDef = this.getProtocolDef(protocolNode.name);

                if (!protocolDef)
                {
                    this.addError(
                        protocolNode,
                        "cannot find protocol declaration for '%s'",
                        protocolNode.name
                    );
                }

                protocolList.push(protocols[i].name);
            }

            protocols = " <" + protocolList.join(", ") + ">";
        }
        else
            protocols = "";

        comment = "@implementation " + className + inheritFrom + protocols;
        buffer.concat(
            ClassDef.declarationTemplate(
            {
                comment: comment,
                "class": className,
                superclass: superclass || "Nil",
                inheritFrom: inheritFrom
            })
        );
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

Compiler.prototype.checkForUnknownType = function(node, type, classOrProtocolDef)
{
    // We are only interested in typeIsClass === true because plain data types are known.
    //noinspection OverlyComplexBooleanExpressionJS
    if (this.shouldWarnAbout("unknown-types") &&
        !this.getClassDef(type) &&
        !this.getProtocolDef(type) &&
        !this.getTypeDef(type) &&
        (classOrProtocolDef ? type !== classOrProtocolDef.name : true))
    {
        this.addWarning(node, "unknown type '%s'", type);
    }
};

// Helper for codeGenerator.ClassDeclaration
Compiler.prototype.addIvars = function(node, compileNode, scope, classDef, classScope)  // -> hasAccessors
{
    var buffer = this.jsBuffer,
        hasAccessors = false;

    buffer.concat("\n\nclass_addIvars($the_class,\n[");
    indentation.indent();

    if (!classScope.ivars)
        classScope.ivars = Object.create(null);

    for (var i = 0; i < node.ivardeclarations.length; i++)
    {
        var ivarDecl = node.ivardeclarations[i],
            ivarIdentifier = ivarDecl.id,
            ivarName = ivarIdentifier.name,
            previousDeclaration = this.findIvar(ivarName, classDef);

        if (previousDeclaration)
        {
            this.addError(
                ivarIdentifier,
                "redeclaration of instance variable '%s' in class '%s'",
                ivarName,
                node.classname.name
            );

            this.addNote(
                previousDeclaration.ivar,
                "previous declaration is here, in class '%s'",
                previousDeclaration.className
            );

            continue;
        }

        var typeName = ivarDecl.ivartype ? ivarDecl.ivartype.name : null,
            ivarTypeIsClass = ivarDecl.ivartype ? ivarDecl.ivartype.typeisclass : false,
            ivars = classDef.ivars,
            ivar = { type: typeName, name: ivarName, node: ivarDecl },
            accessors = ivarDecl.accessors;

        if (ivarTypeIsClass)
            this.checkForUnknownType(ivarDecl.ivartype, typeName, classDef);

        buffer.concat(util.format("\nnew objj_ivar(\"%s\"".indent(), ivarName));

        if (this.options.generateIvarTypeSignatures)
            buffer.concat(util.format(", \"%s\"", typeName));

        buffer.concat("),");

        if (ivarDecl.outlet)
            ivar.outlet = true;

        ivars[ivarName] = ivar;

        classScope.ivars[ivarName] = {
            type: "ivar",
            name: ivarName,
            node: ivarIdentifier,
            ivar: ivar
        };

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

Compiler.prototype.handleShadowedIvar = function(scope, identifierNode, ivarNode)
{
    var identifier = identifierNode.name;

    this.addWarning(
        identifierNode,
        "local declaration of '%s' shadows an instance variable",
        identifier
    );

    this.addNote(ivarNode, "instance variable is declared here");

    // Here we check to see if an ivar with the same name exists
    // and if we have prefixed 'self.' on previous uses.
    // If so we have to remove the prefixes and issue a warning
    // that the variable hides the ivar.

    var ivarRefs = scope.ivarRefs ? scope.ivarRefs[identifier] : null;

    if (ivarRefs)
    {
        for (var i = 0; i < ivarRefs.length; i++)
        {
            var ivarInfo = ivarRefs[i];

            this.jsBuffer.remove(ivarInfo.index);

            this.addWarning(
                ivarInfo.node,
                "reference to local variable '%s' shadows an instance variable",
                identifier
            );
        }

        delete scope.ivarRefs[identifier];
    }
};

Compiler.prototype.addTypeDef = function(typedef)
{
    this.typedefs[typedef.name] = typedef;
};

Compiler.prototype.getTypeDef = function(/* String */ name)
{
    if (!name)
        return null;

    return this.typedefs[name] || null;
};

/*
    When a global declaration is made, make sure it has not already
    been made for a different type of symbol, or that it is superfluous.
    Possible symbol types:

    @typedef
    @class
    @global
    global variables
    @interface
    @implementation
    @protocol
*/
Compiler.prototype.isUniqueDefinition = function(node, scope, name)
{
    var def = this.getClassDef(name),
        previousType = null,
        previousNode;

    if (def)
    {
        // If def and node are both @implementation, it's an error
        if (def.ivars && node.type === "ClassDeclaration")
        {
            this.addError(node, "duplicate definition of class '%s'", name);

            // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
            this.addNote(def.node, "previous definition is here");

            return false;
        }

        // If def is an @implementation and node is a @class,
        // node is not unique but it isn't an error. If node is an
        // @implementation and def is a @class, pretend the @implementation
        // is unique so it can replace the @class.
        if (node.type.startsWith("Class"))
            return node.type === "ClassDeclaration";

        previousNode = def.node;
        previousType = "a class";
    }

    if (!previousType)
    {
        def = this.getTypeDef(name);

        if (def)
        {
            if (node.type === "TypeDefStatement")
                return false;  // superfluous, skip it

            previousNode = def.node;
            previousType = "a @typedef";
        }
    }

    if (!previousType)
    {
        def = this.getProtocolDef(name);

        if (def)
        {
            if (node.type === "ProtocolDeclaration")
            {
                this.addError(node, "duplicate definition of protocol '%s'", name);

                // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
                this.addNote(def.node, "previous definition is here");

                return false;
            }

            previousNode = def.node;
            previousType = "a protocol";
        }
    }

    if (!previousType)
    {
        def = scope.getGlobalVar(name);

        if (def)
        {
            if (node.type === "GlobalStatement" || (node.type === "Identifier" && scope.assignment))
                return false;  // superfluous, skip it

            previousNode = def.node;
            previousType = "a global";
        }
    }

    if (!previousType)
    {
        def = this.getPredefinedGlobal(name);

        if (def !== undefined)
            previousType = "a predefined global";
    }

    if (previousType)
    {
        this.addError(node, "'%s' previously defined as %s", name, previousType);

        if (previousNode)
            this.addNote(previousNode, "definition is here");

        return false;
    }

    return true;
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
        {
            if (accessors.setter)
            {
                this.addError(
                    accessors.setter,
                    "setter cannot be specified for a readonly property"
                );
            }

            continue;
        }

        var property = info.property;

        selector = accessors.setter ? accessors.setter.name : null;

        if (!selector)
            selector = "set" + property.capitalize() + ":";

        if (classDef.getInstanceMethod(selector))
            continue;

        classDef.addInstanceMethod(new MethodDef(selector, ["void", ivarType]));

        var code;

        if (accessors.copy)
            code = ClassDef.setterCopyTemplate({ ivar: ivarName }).indent();
        else
            code = ("self." + ivarName + " = newValue;").indent();

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

    buffer.concat(declaration + MethodDef.declarationTemplate({ selector: selector, type: node.methodtype }).indent());

    if (node.body)
    {
        buffer.concat("\nfunction".indent());

        if (this.options.generateMethodFunctionNames)
            buffer.concat(util.format(" $%s__%s", scope.currentClassName(), selector.replace(/:/g, "_")));

        buffer.concat("(self, _cmd");
        methodScope.methodType = node.methodtype;
        methodScope.selector = selector;
        methodScope.vars.self = { type: "method base", scope: methodScope };
        methodScope.vars._cmd = { type: "method base", scope: methodScope };

        for (var i = 0; i < nodeArguments.length; i++)
        {
            var argument = nodeArguments[i],
                argumentName = argument.identifier.name;

            buffer.concat(", " + argumentName);
            methodScope.vars[argumentName] = { type: "method argument", node: argument };
        }

        buffer.concat(")");

        compileNode(node.body, methodScope);
    }
    else
        buffer.concat(" Nil");

    if (this.options.generateMethodArgumentTypeSignatures)
    {
        var signatures = types.map(function(type)
            {
                return "\"" + type + "\"";
            }).join(", ");

        buffer.concat(",\n" + ("// argument types\n[" + signatures + "]").indent());
    }

    buffer.concat("),");
    indentation.dedent();

    return selector;
};

Compiler.prototype.getCode = function()
{
    if (this.compiledCode === null)
    {
        // Be sure to terminate with EOL
        this.compiledCode = this.jsBuffer.toString();

        if (this.compiledCode.charAt(this.compiledCode.length - 1) !== "\n")
            this.compiledCode += "\n";

        if (this.options.sourceMap)
            this.compiledCode += "//# sourceMappingURL=" + this.destPath + ".map\n";
    }

    return this.compiledCode;
};

Compiler.prototype.getAST = function()
{
    return JSON.stringify(this.AST, null, indentation.indentWidth);
};

Compiler.prototype.getSourceMap = function()
{
    return this.jsBuffer.getSourceMap();
};

Compiler.prototype.getPredefinedGlobal = function(identifier)
{
    return this.predefinedGlobals[identifier];
};

Compiler.prototype.isPredefinedGlobal = function(identifier)
{
    return identifier in this.predefinedGlobals;
};

Compiler.prototype.getIssues = function()
{
    return this.issues;
};

Compiler.prototype.shouldWarnAbout = function(warning)
{
    return this.options.warnings[warning];
};

Compiler.prototype.filterIdentifierIssues = function(scope)
{
    this.issues = this.issues.filter(function(issue)
    {
        if (issue instanceof exceptions.IdentifierIssue)
            return !issue.identifierIsValidInScope(scope);

        return true;
    });
};

Compiler.getRelativeSourcePath = function(from, to)
{
    from = from || to;

    if (from === to)
        return path.basename(from);

    return path.relative(from, to);
};

Compiler.prototype.getRelativeSourcePath = function(sourcePath)
{
    return Compiler.getRelativeSourcePath(sourcePath, this.sourcePath);
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

    var compileNode = function(node, scope, virtualType)
    {
        var buffer = scope.compiler.jsBuffer,
            localLastNode = lastNode,
            sameNode = localLastNode === node,
            i;

        lastNode = node;

        if (!sameNode)
        {
            if (includeComments && node.commentsBefore && node.commentsBefore !== lastComment)
            {
                for (i = 0; i < node.commentsBefore.length; i++)
                    buffer.concat(node.commentsBefore[i]);
            }

            Scope.pushNode(node);
            buffer.concatFormat(node, scope, "before");
        }

        visitor[virtualType || node.type](node, scope, compileNode);

        if (!sameNode)
        {
            buffer.concatFormat(node, scope, "after");
            Scope.popNode(node);
        }

        if (includeComments && !sameNode && node.commentsAfter)
        {
            for (i = 0; i < node.commentsAfter.length; i++)
                buffer.concat(node.commentsAfter[i]);

            lastComment = node.commentsAfter;
        }
        else
            lastComment = null;
    };

    compileNode(this.AST, new Scope(null, { compiler: this }));
};

Compiler.prototype.compileDependentStatement = function(node, scope, compileNode)
{
    var single = node.type !== "BlockStatement";

    if (single)
        indentation.indent();

    compileNode(node, scope);

    if (single)
        indentation.dedent();
};
