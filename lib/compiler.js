"use strict";

const
    acorn = require("acorn-objj"),
    exceptions = require("./exceptions"),
    formats = require("./formats"),
    globals = require("./globals"),
    indentation = require("./indentation"),
    issueHandler = require("acorn-issue-handler"),
    language = require("./language"),
    path = require("path"),
    Scope = require("./scope"),
    StringBuffer = require("./stringbuffer");

const // jscs: ignore requireMultipleVarDecl
    indenter = indentation.indenter,
    indentString = indentation.indentString,
    ClassDef = language.ClassDef,
    MethodDef = language.MethodDef;

exports.version = "1.0.0";
exports.acorn = acorn;

const isLogicalOrBinaryExpression = acorn.utils.makeKeywordRegexp("LogicalExpression BinaryExpression");

// acorn (parser) options. For more information see acorn-objj.
// Options may be passed to further configure the compiler. These options are recognized:
exports.defaultOptions = {
    // We use a function here to create a new object every time we copy the default options.
    acornOptions() { return Object.create(null); },

    // If true, generates a source map for the compiled file.
    sourceMap: false,

    // A URL to the root directory of the source files, used by the source map.
    sourceRoot: ".",

    // Pass in class definitions. New class definitions in the source file will be added to this when compiling.
    classDefs() { return new Map(); },

    // Pass in protocol definitions. New protocol definitions in the source file will be added to this when compiling.
    protocolDefs() { return new Map(); },

    // Pass in typedef definitions. New typedef definitions in the source file will be added to this when compiling.
    typedefs() { return new Map(); },

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

    // Objective-J methods are implemented as functions. If this option is true, the functions
    // are named $<class>_<method>, where <class> is the class name, and <method> is the method name.
    // If this option is false, the function is anonymous.
    generateMethodNames: true,

    // If true, the compiler generates type information for method arguments and ivars.
    generateTypeSignatures: true,

    // Supported compiler warnings and their default values.
    warnings: {
        debugger: true,
        "shadowed-vars": true,
        "implicit-globals": true,
        "unknown-identifiers": true,
        "parameter-types": false,
        "unknown-types": true
    }
};

const
    operatorPrecedence = {
        // MemberExpression
        // These two are never used, since the "computed" attribute of the MemberExpression
        // determines which one to use.
        // ".": 0, "[]": 0,

        // NewExpression
        // This is never used.
        // "new": 1,

        // All these are UnaryExpression or UpdateExpression and are never used.
        // "!": 2, "~": 2, "-": 2, "+": 2, "++": 2, "--": 2, "typeof": 2, "void": 2, "delete": 2,

        // BinaryExpression
        "*": 3, "/": 3, "%": 3,
        "+": 4, "-": 4,
        "<<": 5, ">>": 5, ">>>": 5,
        "<": 6, "<=": 6, ">": 6, ">=": 6, in: 6, instanceof: 6,
        "==": 7, "!=": 7, "===": 7, "!==": 7,
        "&": 8,
        "^": 9,
        "|": 10,

        // LogicalExpression
        "&&": 11,
        "||": 12

        // ConditionalExpression
        // AssignmentExpression
    },

    expressionTypePrecedence = {
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
    let result;

    switch (node.type)
    {
        case "Literal":
        case "Identifier":
            return true;

        case "ArrayExpression":
            for (const element of node.elements)
            {
                if (!isIdempotentExpression(element))
                    return false;
            }

            return true;

        case "objj_DictionaryLiteral":
            for (let i = 0; i < node.keys.length; i++)
            {
                if (!isIdempotentExpression(node.keys[i]))
                    return false;

                if (!isIdempotentExpression(node.values[i]))
                    return false;
            }

            return true;

        case "ObjectExpression":
            for (const property of node.properties)
            {
                if (!isIdempotentExpression(property.value))
                    return false;
            }

            return true;

        case "FunctionExpression":
            for (const param of node.params)
            {
                if (!isIdempotentExpression(param))
                    return false;
            }

            return true;

        case "SequenceExpression":
            for (const expression of node.expressions)
            {
                if (!isIdempotentExpression(expression))
                    return false;
            }

            return true;

        case "UnaryExpression":
            result = isIdempotentExpression(node.argument);
            break;

        case "BinaryExpression":
            result = isIdempotentExpression(node.left) && isIdempotentExpression(node.right);
            break;

        case "ConditionalExpression":
            result = isIdempotentExpression(node.test) &&
                isIdempotentExpression(node.consequent) &&
                isIdempotentExpression(node.alternate);
            break;

        case "MemberExpression":
            result = isIdempotentExpression(node.object) &&
                (!node.computed || isIdempotentExpression(node.property));
            break;

        case "objj_Dereference":
            result = isIdempotentExpression(node.expr);
            break;

        case "objj_Reference":
            result = isIdempotentExpression(node.element);
            break;

        default:
            result = false;
    }

    return result;
}

class Compiler
{
    constructor(source, sourcePath, destPath, ast, issues, options)
    {
        this.source = source;
        this.sourcePath = sourcePath;
        this.destPath = destPath;
        this.AST = ast;
        this.issues = issues;
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
        this.errorCount = 0;
        this.lastPos = 0;
        this.jsBuffer = new StringBuffer(this);
        this.compiledCode = null;
    }

    initPredefinedGlobals()
    {
        this.predefinedGlobals = Object.create(null);
        Object.assign(
            this.predefinedGlobals,
            globals.reserved,
            globals.nonstandard,
            globals.ecmaIdentifiers,
            globals.newEcmaIdentifiers,
            globals[this.options.environment]
        );

        if (this.options.environment === "browser")
            Object.assign(this.predefinedGlobals, globals.devel);
    }

    // Returns true if subnode has higher precedence than node.
    // If subnode is the right subnode of a binary expression, right is true.
    static subnodeHasPrecedence(node, subnode, right)
    {
        const
            nodeType = node.type,
            nodePrecedence = expressionTypePrecedence[nodeType] || -1,
            subnodePrecedence = expressionTypePrecedence[subnode.type] || -1;

        if (subnodePrecedence > nodePrecedence)
            return true;

        if (nodePrecedence === subnodePrecedence && isLogicalOrBinaryExpression.test(nodeType))
        {
            const
                subnodeOperatorPrecedence = operatorPrecedence[subnode.operator],
                nodeOperatorPrecedence = operatorPrecedence[node.operator];

            return (
                subnodeOperatorPrecedence > nodeOperatorPrecedence ||
                (right === true && nodeOperatorPrecedence === subnodeOperatorPrecedence)
            );
        }

        return false;
    }

    createClass(node, name, superclassNode, category, ivars, instanceMethods, classMethods, protocols)
    {
        // To be an @implementation declaration it must have method and ivar dictionaries.
        // Otherwise it's a @class declaration.

        const superclassDef = superclassNode ? this.getClassDef(superclassNode.name) : null;

        if (superclassNode && (!superclassDef || superclassDef.node.type === "objj_ClassStatement"))
        {
            this.addError(
                superclassNode,
                "cannot find implementation declaration for '%s', superclass of '%s'",
                superclassNode.name,
                name
            );
        }

        return new ClassDef(node, name, superclassNode, superclassDef, category, ivars, instanceMethods, classMethods, protocols);
    }

    compileParenthesizedExpression(node, scope, compileNode)
    {
        const buffer = this.jsBuffer;

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
    }

    concatParenthesizedExpression(node, scope, compileNode, nodeToCompile)
    {
        const buffer = this.jsBuffer;

        buffer.concatLeftParens(node, scope);
        compileNode(nodeToCompile || node, scope);
        buffer.concatRightParens(node, scope);
    }

    concatPrecedenceExpression(node, subnode, scope, compileNode, right)
    {
        if (this.constructor.subnodeHasPrecedence(node, subnode, right))
            this.concatParenthesizedExpression(subnode, scope, compileNode);
        else
            compileNode(subnode, scope);
    }

    /*
        We do not allow dereferencing of expressions with side effects because
        we might need to evaluate the expression twice in certain uses of deref,
        which is not obvious when you look at the deref operator in plain code.
    */
    checkCanDereference(node)
    {
        if (!isIdempotentExpression(node))
            this.addError(node, "dereference expressions may not have side effects");
    }

    /*
        Helper for code_generator.MethodDeclaration

        objj (for methods):

        selectors: Array - Identifier nodes, one for each element in args
        args: Array - Objects with these keys/values:
            type: objj_ObjectiveJType node
            id: Identifier node
    */
    makeSelector(scope, compileNode, args, types, selectors) // -> selector
    {
        let selector = selectors[0].name;

        for (let i = 0; i < args.length; i++)
        {
            const
                arg = args[i],
                argType = arg.type,
                objj = argType ? argType.objj : null,
                protocols = objj ? objj.protocols : null;

            types.push(argType ? objj.name : "id");

            if (i === 0)
                selector += ":";
            else
                selector += (selectors[i] ? selectors[i].name : "") + ":";

            if (protocols)
            {
                for (const protocol of protocols)
                {
                    if (!this.getProtocolDef(protocol.name))
                    {
                        this.addWarning(
                            protocol,
                            "cannot find protocol declaration for '%s'",
                            protocol.name
                        );
                    }
                }
            }
        }

        return selector;
    }

    _addIssue(method, Class, node, message)
    {
        const
            sourcePath = this.getRelativeSourcePath(),
            args = Array.prototype.slice.call(arguments, 4);

        let issue;

        if (Class)
            issue = method.call(this.issues, Class, this.source, sourcePath, node, message, ...args);
        else
            issue = method.call(this.issues, this.source, sourcePath, node, message, ...args);

        issue.node = node;
    }

    addIssue(Class)
    {
        if (this.options.ignoreWarnings && Class instanceof issueHandler.Warning)
            return;

        const args = [].slice.call(arguments, 1);

        this._addIssue(this.issues.addIssue, Class, ...args);
    }

    addNote()
    {
        this._addIssue(this.issues.addNote, null, ...arguments);
    }

    addWarning()
    {
        if (!this.options.ignoreWarnings)
            this._addIssue(this.issues.addWarning, null, ...arguments);
    }

    addError()
    {
        this._addIssue(this.issues.addError, null, ...arguments);

        if (this.issues.errorCount > this.options.maxErrors)
            throw new exceptions.TooManyErrors(this.options.maxErrors);
    }

    throwInternalError()
    {
        this.addError(...arguments);
        throw new exceptions.InternalError();
    }

    getErrorCount()
    {
        return this.issues.errorCount;
    }

    getIvarForCurrentClass(ivarName, scope)
    {
        const ivar = scope.getIvarForCurrentClass(ivarName);

        if (ivar)
            return ivar;

        let classDef = this.getClassDef(scope.currentClassName());

        while (classDef)
        {
            const ivarDef = classDef.getIvar(ivarName);

            if (ivarDef)
                return ivarDef;

            classDef = classDef.superclassDef;
        }

        return null;
    }

    getClassDef(/* String */ name)
    {
        if (!name)
            return null;

        return this.classDefs.get(name) || null;
    }

    addClassDef(name, def)
    {
        if (def.category)
            name += "+" + def.category;

        this.classDefs.set(name, def);
    }

    static findDefinition(name, /* Map */ defs)
    {
        name = name.toLowerCase();

        const names = defs.keys(defs);

        for (const defName of names)
        {
            if (name === defName.toLowerCase())
                return defs.get(defName);
        }

        return null;
    }

    findDef(/* String */ name)
    {
        return this.constructor.findDefinition(name, this.classDefs) ||
               this.constructor.findDefinition(name, this.protocolDefs);
    }

    getProtocolDef(/* String */ name)
    {
        if (!name)
            return null;

        return this.protocolDefs.get(name) || null;
    }

    addProtocolDef(name, def)
    {
        this.protocolDefs.set(name, def);
    }

    // Helper for code_generator.ClassDeclaration
    checkProtocolConformance(node, classDef, protocols)
    {
        if (this.options.ignoreWarnings)
            return;

        for (const protocol of protocols)
        {
            const protocolDef = this.getProtocolDef(protocol.name);

            if (!protocolDef)
                continue;

            const unimplementedMethods = classDef.unimplementedMethodsForProtocol(protocolDef);

            if (unimplementedMethods.length === 0)
                continue;

            for (const method of unimplementedMethods)
            {
                const methodDef = method.methodDef;

                this.addWarning(
                    protocol,
                    "method '%s' in protocol '%s' not implemented",
                    methodDef.name,
                    protocol.name
                );

                this.addNote(
                    methodDef.node,
                    "method '%s' declared here",
                    methodDef.name
                );
            }
        }
    }

    /*
        Helper for code_generator.ClassDeclaration

        objj:

        name: Identifier node - Class name
        superclass: Identifier node - Superclass name
        category: Identifier node - Category name
        protocols: Array - Identifier nodes
        ivars: Array - ivar nodes
        body: Array - Statement nodes
    */
    declareClass(node) // -> classDef
    {
        const
            buffer = this.jsBuffer,
            objj = node.objj,
            className = objj.name.name;

        let category;

        if (objj.category)
            category = objj.category.name;

        const
            classDef = this.createClass(node, className, objj.superclass, category),
            superclass = objj.superclass ? objj.superclass.name : null,
            inheritFrom = superclass ? " : " + superclass : "",
            protocolList = [];

        let protocols = objj.protocols;

        if (protocols)
        {
            for (const protocolNode of protocols)
            {
                const protocolDef = this.getProtocolDef(protocolNode.name);

                if (!protocolDef)
                {
                    this.addError(
                        protocolNode,
                        "cannot find protocol declaration for '%s'",
                        protocolNode.name
                    );
                }

                protocolList.push(protocolNode.name);
            }

            protocols = " <" + protocolList.join(", ") + ">";
        }
        else
            protocols = "";

        let comment;

        if (category)
        {
            comment = `@implementation ${className} (${category})`;

            buffer.concat(
                indentString(ClassDef.categoryTemplate(
                    {
                        comment,
                        class: className,
                        category
                    }
                ))
            );
        }
        else
        {
            comment = "@implementation " + className + inheritFrom + protocols;

            buffer.concat(
                ClassDef.declarationTemplate(
                    {
                        comment,
                        class: className,
                        superclass: superclass || "Nil",
                        inheritFrom
                    }
                )
            );
        }

        return { classDef, comment };
    }

    static getAccessorInfo(accessors, ivarName)
    {
        let property = (accessors.property && accessors.property.name) || ivarName;

        if (property.charAt(0) === "_")
            property = property.substring(1);

        const getter = (accessors.getter && accessors.getter.name) || property;

        return { property, getter };
    }

    static findIvar(name, classDef) // -> { ivar: node, className: String }
    {
        while (true)
        {
            const ivar = classDef.getIvar(name);

            if (ivar)
                return { ivar: ivar.node, className: classDef.node.objj.name.name };

            classDef = classDef.superclassDef;

            if (!classDef)
                return null;
        }
    }

    checkForUnknownType(node, type, classOrProtocolDef)
    {
        // We are only interested in typeIsClass === true because plain data types are known.
        if (this.shouldWarnAbout("unknown-types") &&
            !this.getClassDef(type) &&
            !this.getProtocolDef(type) &&
            !this.getTypeDef(type) &&
            (classOrProtocolDef ? type !== classOrProtocolDef.name : true))
        {
            this.addWarning(node, `unknown type '${type}'`);
        }
    }

    /*
        Helper for code_generator.ClassDeclaration

        objj:

        isOutlet: boolean - Whether the ivar is an IB outlet
        type: objj_ObjectiveJType node - The ivar's type
        id: Identifier node - The ivar's name
        accessors: Object - Keys are accessor attribute names, values are:
            property, getter, setter - Identifier node
            readwrite, readonly, copy - true
    */
    addIvars(node, compileNode, scope, classDef, classScope) // -> hasAccessors
    {
        const buffer = this.jsBuffer;
        let hasAccessors = false;

        buffer.concat("\n\nclass_addIvars($the_class,\n[");
        indenter.indent();

        if (!classScope.ivars)
            classScope.ivars = Object.create(null);

        for (const ivarDecl of node.objj.ivars)
        {
            const
                objj = ivarDecl.objj,
                ivarIdentifier = objj.id,
                ivarName = ivarIdentifier.name,
                previousDeclaration = this.constructor.findIvar(ivarName, classDef);

            if (previousDeclaration)
            {
                this.addError(
                    ivarIdentifier,
                    "redeclaration of instance variable '%s' in class '%s'",
                    ivarName,
                    classDef.name
                );

                this.addNote(
                    previousDeclaration.ivar,
                    "previous declaration is here, in class '%s'",
                    previousDeclaration.className
                );

                continue;
            }

            /*
                type objj:

                name: string - The type's name
                isClass: boolean - Whether the type is a class or a POD
                protocols: Array - Array of protocols an 'id' type conforms to
            */
            const
                type = objj.type.objj,
                typeName = type.name,
                ivarTypeIsClass = type.isClass,
                ivar = { type: typeName, name: ivarName, node: ivarDecl },
                accessors = objj.accessors;

            if (ivarTypeIsClass)
                this.checkForUnknownType(objj.type, typeName, classDef);

            buffer.concat(indentString(`\nnew objj_ivar("${ivarName}"`));

            if (this.options.generateTypeSignatures)
                buffer.concat(`, "${typeName}"`);

            buffer.concat("),");

            if (objj.isOutlet)
                ivar.isOutlet = true;

            classDef.addIvar(ivarName, ivar);

            classScope.ivars[ivarName] = {
                type: "ivar",
                name: ivarName,
                node: ivarIdentifier,
                ivar
            };

            if (accessors)
                hasAccessors = true;
        }

        if (node.objj.ivars.length > 0)
        {
            indenter.dedent();
            buffer.concat("\n]);");
        }

        return hasAccessors;
    }

    handleShadowedIvar(scope, identifierNode, ivarNode)
    {
        const identifier = identifierNode.name;

        if (!this.options.ignoreWarnings)
        {
            this.addWarning(
                identifierNode,
                "local declaration of '%s' shadows an instance variable",
                identifier
            );

            this.addNote(ivarNode, "instance variable is declared here");
        }

        // Here we check to see if an ivar with the same name exists
        // and if we have prefixed 'self.' on previous uses.
        // If so we have to remove the prefixes and issue a warning
        // that the variable hides the ivar.

        const ivarRefs = scope.ivarRefs ? scope.ivarRefs.get(identifier) : null;

        if (ivarRefs)
        {
            for (const ivarInfo of ivarRefs)
            {
                this.jsBuffer.remove(ivarInfo.index);

                this.addWarning(
                    ivarInfo.node,
                    "reference to local variable '%s' shadows an instance variable",
                    identifier
                );
            }

            scope.ivarRefs.delete(identifier);
        }
    }

    addTypeDef(typedef)
    {
        this.typedefs.set(typedef.name, typedef);
    }

    getTypeDef(/* String */ name)
    {
        if (!name)
            return null;

        return this.typedefs.get(name) || null;
    }

    /*
        When a global declaration is made, make sure it is not a duplicate
        of the same type of symbol, that it has not already been made for a
        different type of symbol, or that it is superfluous.

        Possible symbol types:

        @typedef
        @class
        @global
        global variables
        @interface
        @implementation
        @implementation with category
        @protocol
    */
    isUniqueDefinition(node, scope, name)
    {
        const
            compiler = scope.compiler,
            objj = node.objj;

        let previousType = null,
            previousNode,
            def;

        /*
            First check classes (@implementation). There are several possibilities
            we have to deal with:

            1. Category already declared with the same name: duplicate error.
            2. Category has no matching declared class: error.
            3. @implementation already declared with the same name: duplicate error.
            4. @implementation already declared with @class: allow the @implementation
               to replace the @class.
            5. @implementation already declared as a different symbol type: error.
        */
        if (node.type === "objj_ClassDeclaration")
        {
            def = this.getClassDef(name);

            if (objj.category)
            {
                if (def)
                {
                    const
                        category = objj.category.name,
                        categoryDef = this.getClassDef(name + "+" + category);

                    if (categoryDef)
                    {
                        // Case #1
                        this.addError(node, "duplicate definition of category '%s (%s)'", name, category);

                        // eslint-disable-next-line no-warning-comments
                        // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
                        this.addNote(categoryDef.node, "previous definition is here");

                        return false;
                    }

                    // If we get here, it's what we expect: a category with already declared class
                    return true;
                }

                // Case #2
                this.addError(node, "cannot find implementation declaration for '%s'", name);

                return false;
            }
            else if (def)
            {
                // def could be @implementation or @class
                if (def.node.type === "objj_ClassDeclaration")
                {
                    // Case #3
                    this.addError(node, "duplicate definition of class '%s'", name);

                    // eslint-disable-next-line no-warning-comments
                    // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
                    this.addNote(def.node, "previous definition is here");

                    return false;
                }

                // Case #4: If node is an @implementation and def is a @class,
                // pretend the @implementation is unique so it can replace the @class.
                return true;
            }
        }
        else
        {
            // node is not a class or category, see if the name is already defined as a class
            def = this.getClassDef(name);

            if (def)
            {
                if (!compiler.options.ignoreWarnings)
                {
                    this.addWarning(node, "duplicate @class definition '%s' is ignored", name);

                    // eslint-disable-next-line no-warning-comments
                    // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
                    this.addNote(def.node, "previous definition is here");
                }

                return false;
            }
        }

        if (!previousType)
        {
            def = this.getTypeDef(name);

            if (def)
            {
                if (node.type === "objj_TypeDefStatement")
                    return false; // Superfluous, skip it

                previousNode = def.node;
                previousType = "a @typedef";
            }
        }

        if (!previousType)
        {
            def = this.getProtocolDef(name);

            if (def)
            {
                if (node.type === "objj_ProtocolDeclaration")
                {
                    if (!compiler.options.ignoreWarnings)
                    {
                        this.addWarning(node, "duplicate definition of protocol '%s' is ignored", name);

                        // eslint-disable-next-line no-warning-comments
                        // TODO: this.getRelativeSourcePath() should be url of the previous implementation's file
                        this.addNote(def.node, "previous definition is here");
                    }

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
                if (node.type === "objj_GlobalStatement" || (node.type === "Identifier" && scope.assignment))
                    return false; // Superfluous, skip it

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
    }

    /*
        Helper for code_generator.ClassDeclaration

        objj:

        isOutlet: boolean - Whether the ivar is an IB outlet
        type: objj_ObjectiveJType node - The ivar's type
        id: Identifier node - The ivar's name
        accessors: Object - Keys are accessor attribute names, values are:
            property, getter, setter - Identifier node
            readwrite, readonly, copy - true
    */
    generateAccessors(node, classDef) // -> accessors
    {
        const
            buffer = this.jsBuffer,
            objj = node.objj;

        let havePreviousAccessors = false;

        indenter.indent();

        for (let ivar of objj.ivars)
        {
            ivar = ivar.objj;

            const accessors = ivar.accessors;

            if (!accessors)
                continue;

            const
                ivarType = ivar.type ? ivar.type.objj.name : null,
                ivarName = ivar.id.name,
                info = this.constructor.getAccessorInfo(accessors, ivarName);

            let selector = info.getter;

            if (!classDef.getInstanceMethod(selector))
            {
                classDef.addInstanceMethod(new MethodDef(selector, [ivarType]));

                let getterCode = havePreviousAccessors ? "\n" : "";

                getterCode += indentString(ClassDef.getterTemplate(
                    {
                        readonly: accessors.readonly ? "readonly, " : "",
                        selector,
                        class: classDef.name,
                        ivar: ivarName,
                        returnType: ivarType
                    }));

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

            const property = info.property;

            selector = accessors.setter ? accessors.setter.name : null;

            if (!selector)
                selector = `set${property.charAt(0).toUpperCase()}${property.substr(1)}:`;

            if (classDef.getInstanceMethod(selector))
                continue;

            classDef.addInstanceMethod(new MethodDef(selector, ["void", ivarType]));

            let code,
                copy;

            if (accessors.copy)
            {
                code = indentString(ClassDef.setterCopyTemplate({ ivar: ivarName }));
                copy = "copy, ";
            }
            else
            {
                code = indentString("self." + ivarName + " = newValue;");
                copy = "";
            }

            let setterCode = havePreviousAccessors ? "\n" : "";

            setterCode += indentString(ClassDef.setterTemplate({
                copy,
                setter: selector.slice(0, -1), // Trim trailing :
                selector,
                class: classDef.name,
                code,
                returnType: ivarType ? ivarType : "id"
            }));

            buffer.concat(setterCode, node);
            havePreviousAccessors = true;
        }

        indenter.dedent();
    }

    /*
        Helper for code_generator.MethodDeclaration

        objj (for methods):

        methodType: string - "+" or "-"
        action: objj_ActionType node
        returnType: objj_ObjectiveJType node
        selectors: Array - Identifier nodes, one for each element in args
        args: Array - Objects with these keys/values:
            type: objj_ObjectiveJType node
            id: Identifier node
        varArgs: boolean - true if signature ends with ", ..."
        body: BlockStatement node
    */
    compileMethod(node, scope, compileNode, methodScope, args, types)
    {
        indenter.indent();

        const
            objj = node.objj,
            selector = this.makeSelector(scope, compileNode, args, types, objj.selectors),
            buffer = this.jsBuffer,
            declaration = buffer.isEmpty() ? "" : "\n";

        buffer.concat(declaration + indentString(MethodDef.declarationTemplate({ selector, type: objj.methodType })));

        // If this is a protocol, the method will have no body
        if (objj.body)
        {
            buffer.concat(indentString("\nfunction"));

            if (this.options.generateMethodNames)
                buffer.concat(" $" + scope.currentClassName() + "__" + selector.replace(/:/g, "_"));

            buffer.concat("(self, _cmd");
            methodScope.methodType = objj.methodType;
            methodScope.selector = selector;
            methodScope.vars.self = { type: "method base", scope: methodScope };
            methodScope.vars._cmd = { type: "method base", scope: methodScope };

            for (const arg of args)
            {
                const argName = arg.id.name;

                buffer.concat(", " + argName);
                methodScope.vars[argName] = { type: "method argument", node: arg };
            }

            buffer.concat(")");

            // Methods create a var scope
            objj.body.objjIsVarScope = true;
            compileNode(objj.body, methodScope);
        }
        else
            buffer.concat(" null");

        if (this.options.generateTypeSignatures)
        {
            const signatures = types.map(type => `"${type}"`).join(", ");

            buffer.concat(",\n" + indentString(`// argument types\n[${signatures}]`));
        }

        buffer.concat("),");
        indenter.dedent();

        return selector;
    }

    getCode()
    {
        if (this.compiledCode === null)
        {
            // Be sure to terminate with EOL
            this.compiledCode = this.jsBuffer.toString();

            if (this.compiledCode.charAt(this.compiledCode.length - 1) !== "\n")
                this.compiledCode += "\n";

            if (this.options.sourceMap)
                this.compiledCode += `//# sourceMappingURL=${this.destPath}.map\n`;
        }

        return this.compiledCode;
    }

    getAST()
    {
        return JSON.stringify(this.AST, null, indenter.indentWidth);
    }

    getSourceMap()
    {
        return this.jsBuffer.getSourceMap();
    }

    getPredefinedGlobal(identifier)
    {
        return this.predefinedGlobals[identifier];
    }

    isPredefinedGlobal(identifier)
    {
        return identifier in this.predefinedGlobals;
    }

    shouldWarnAbout(warning)
    {
        return this.options.warnings[warning] && !this.options.ignoreWarnings;
    }

    filterIdentifierIssues(scope)
    {
        this.issues.filter(issue =>
        {
            if (issue instanceof exceptions.UnknownIdentifierWarning)
                return !issue.identifierIsValidInScope(scope);

            return true;
        });
    }

    static getRelativeSourcePath(from, to)
    {
        from = from || to;

        if (from === to)
            return path.basename(from);

        let relativePath = path.relative(from, to);

        // If the relative path is outside cwd, make it absolute
        const absolutePath = path.resolve(relativePath);

        if (!absolutePath.startsWith(process.cwd()))
            relativePath = absolutePath;

        return relativePath;
    }

    getRelativeSourcePath()
    {
        return this.sourcePath ? this.constructor.getRelativeSourcePath(process.cwd(), this.sourcePath) : "";
    }

    pushImport(url)
    {
        // This is used to keep track of imports. Each time the compiler imports a file the url is pushed here.
        this.importStack.push(url);
    }

    popImport()
    {
        this.importStack.pop();
    }

    compileWithFormat(visitor)
    {
        let lastNode;

        const
            compileNode = function(node, scope, virtualType)
            {
                // jscs: enable

                const
                    buffer = scope.compiler.jsBuffer,
                    localLastNode = lastNode,
                    sameNode = localLastNode === node;

                lastNode = node;

                if (!sameNode)
                {
                    scope.constructor.pushNode(node);
                    buffer.concatFormat(node, scope, "before");
                }

                visitor[virtualType || node.type](node, scope, compileNode);

                if (!sameNode)
                {
                    buffer.concatFormat(node, scope, "after");
                    scope.constructor.popNode(node);
                }
            },

            globalScope = new Scope(Scope.GLOBAL, null, { compiler: this });

        compileNode(this.AST, globalScope);
        globalScope.closeVarScope();
    }

    static compileDependentStatement(node, scope, compileNode)
    {
        const single = node.type !== "BlockStatement";

        if (single)
            indenter.indent();

        compileNode(node, scope);

        if (single)
            indenter.dedent();
    }
}

Compiler.importStack = [];
exports.Compiler = Compiler;
