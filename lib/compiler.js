"use strict";

const
    acorn = require("acorn-objj"),
    exceptions = require("./exceptions.js"),
    formats = require("./formats.js"),
    globals = require("./globals.js"),
    indentation = require("./indentation.js"),
    issueHandler = require("acorn-issue-handler"),
    language = require("./language.js"),
    path = require("path"),
    Scope = require("./scope.js"),
    StringBuffer = require("./stringbuffer.js");

class MisspelledSymbolMap
{
    constructor(map)
    {
        this.map = new Map();

        for (const key of map.keys())
            this.add(key);
    }

    add(key)
    {
        this.map.set(key.toLocaleLowerCase(), key);
    }

    get(key)
    {
        return this.map.get(key.toLocaleLowerCase());
    }
}

const // jscs: ignore requireMultipleVarDecl
    indenter = indentation.indenter,
    indentString = indentation.indentString,
    ClassDef = language.ClassDef,
    MethodDef = language.MethodDef,

    entityTypes = {
        ENTITY_TYPE_VAR: 0,
        ENTITY_TYPE_FUNCTION: 1,
        ENTITY_TYPE_METHOD: 2
    },

    entityTypeDescriptions = new Map([
        [entityTypes.ENTITY_TYPE_VAR, "local declaration of"],
        [entityTypes.ENTITY_TYPE_FUNCTION, "function parameter"],
        [entityTypes.ENTITY_TYPE_METHOD, "method parameter"]
    ]),

    typeStatements = new Set([
        "objj_ClassStatement",
        "objj_GlobalStatement",
        "objj_TypeDefStatement"
    ]),

    predefinedTypes = new Set([
        "BOOL",
        "byte",
        "char",
        "double",
        "float",
        "id",
        "int",
        "instancetype",
        "JSObject",
        "long",
        "SEL",
        "short",
        "signed",
        "unsigned",
        "CPInteger",
        "CPTimeInterval",
        "CPUInteger"
    ]),

    misspelledTypes = new MisspelledSymbolMap(predefinedTypes);

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
    // are named $<class>_<method>, where <class> is the class name, and <method> is the method name
    // with ':' in the selector replaced with '_'. If this option is false, the function is anonymous.
    methodNames: true,

    // If true, the compiler generates type information for method return types/parameters and ivars.
    typeSignatures: true,

    // Supported optional compiler warnings and their default values.
    warnings: {
        debugger: true,
        "shadowed-vars": true,
        "implicit-globals": true,
        "unknown-identifiers": true,
        "parameter-types": false,
        "unknown-types": false
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
    },

    varTypes = {
        "global var": "a global",
        "@global": "a global",
        "implicit global": "an implicitly declared global",
        "@class": "a class",
        "file var": "a file variable",
        "local var": "a variable in a containing closure",
        "function parameter": "a function parameter",
        "method parameter": "a method parameter"
    };

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
        this.misspelledClasses = new MisspelledSymbolMap(this.classDefs);
        this.protocolDefs = options.protocolDefs;
        this.misspelledProtocols = new MisspelledSymbolMap(this.protocolDefs);
        this.typedefs = options.typedefs;
        this.misspelledTypedefs = new MisspelledSymbolMap(this.typedefs);
        this.format = typeof options.format === "string" ? formats.load(options.format) : options.format;
        this.dependencies = [];
        this.importStack = Compiler.importStack;
        this.errorCount = 0;
        this.lastPos = 0;
        this.jsBuffer = new StringBuffer(this);
        this.instanceMethods = [];
        this.classMethods = [];
        this.compiledCode = null;
        this.initPredefinedGlobals();
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

    createClass(node, name, superclassNode, category)
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

        return new ClassDef(node, name, superclassNode, superclassDef, category);
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

    checkTypeProtocols(protocols)
    {
        if (!protocols)
            return;

        for (const protocol of protocols)
        {
            if (!this.getProtocolDef(protocol.name))
                this.unknownProtocolException(protocol, true);
        }
    }

    /*
        Helper for code_generator.objjMethodDeclaration

        objj (for methods):

        selectors: Array - Identifier nodes, one for each element in params
        params: Array - Objects with these keys/values:
            type: objj_ObjectiveJType node
            id: Identifier node
    */
    makeSelector(scope, compileNode, params, types, selectors) // -> selector
    {
        let selector = selectors[0].name;

        for (let i = 0; i < params.length; i++)
        {
            const
                param = params[i],
                paramType = param.type,
                objj = paramType ? paramType.objj : null,
                protocols = objj ? objj.protocols : null;

            types.push(paramType ? objj.name : "id");

            if (i === 0)
                selector += ":";
            else
                selector += (selectors[i] ? selectors[i].name : "") + ":";

            this.checkTypeProtocols(protocols);
        }

        return selector;
    }

    _addIssue(method, Class, node, message)
    {
        const
            sourcePath = this.getRelativeSourcePath(node.sourceFile),
            args = Array.prototype.slice.call(arguments, 4);

        let issue;

        if (Class)
            issue = method.call(this.issues, Class, this.source, sourcePath, node, message, ...args);
        else
            issue = method.call(this.issues, this.source, sourcePath, node, message, ...args);

        issue.node = node;

        return issue;
    }

    addIssue(Class)
    {
        if (this.options.ignoreWarnings && Class instanceof issueHandler.Warning)
            return null;

        const args = [].slice.call(arguments, 1);

        return this._addIssue(this.issues.addIssue, Class, ...args);
    }

    addNote()
    {
        return this._addIssue(this.issues.addNote, null, ...arguments);
    }

    addWarning()
    {
        if (!this.options.ignoreWarnings)
            return this._addIssue(this.issues.addWarning, null, ...arguments);

        return null;
    }

    addError()
    {
        const issue = this._addIssue(this.issues.addError, null, ...arguments);

        if (this.options.maxErrors > 0 && this.issues.errorCount > this.options.maxErrors)
            throw new exceptions.TooManyErrors(this.options.maxErrors);

        return issue;
    }

    getErrorCount()
    {
        return this.issues.errorCount;
    }

    getIvarForCurrentClass(ivarName, scope)
    {
        const method = scope.currentObjjMethodScope();

        if (method)
        {
            let classDef = this.getClassDef(scope.currentClassName());

            while (classDef)
            {
                const ivarDef = classDef.getIvar(ivarName);

                if (ivarDef)
                    return ivarDef;

                classDef = classDef.superclassDef;
            }
        }

        return null;
    }

    getClassDef(name)
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
        this.misspelledClasses.add(name);
    }

    getProtocolDef(name)
    {
        if (!name)
            return null;

        return this.protocolDefs.get(name) || null;
    }

    addProtocolDef(name, def)
    {
        this.protocolDefs.set(name, def);
        this.misspelledProtocols.add(name);
    }

    // Helper for code_generator.objjClassDeclaration
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

                if (protocolDef)
                    classDef.addProtocol(protocolDef);
                else
                    this.unknownProtocolException(protocolNode);

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

            const declaration =
`// ${comment}
var $the_class = objj_getClass("${className}");

if (!$the_class)
→throw new ReferenceError("Cannot find declaration for class '${className}'");
`;

            buffer.concat(indentString(declaration));
        }
        else
        {
            comment = "@implementation " + className + inheritFrom + protocols;

            const declaration =
`// ${comment}
var $the_class = objj_allocateClassPair(${superclass || "Nil"}, "${className}");
`;

            buffer.concat(declaration);
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

    // Only called for non-predefined Objective-J types (node.objj.isClass)
    checkForUnknownType(node, type)
    {
        if (!this.getClassDef(type) &&
            !this.getProtocolDef(type) &&
            !this.getTypeDef(type) &&
            !predefinedTypes.has(type))
        {
            let message = `unknown type '${type}'`;

            const possibleName = this.findMisspelledName(type);

            if (possibleName)
                message += `; did you mean '${possibleName}'?`;

            this.addWarning(node, message);
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
    addIvars(node, classDef) // -> hasAccessors
    {
        const
            buffer = this.jsBuffer,
            ivars = node.objj.ivars;

        let hasAccessors = false;

        buffer.concat("\n\nclass_addIvars($the_class,\n[");
        indenter.indent();

        for (let i = 0, lastIndex = ivars.length - 1; i <= lastIndex; i++)
        {
            const
                ivarDecl = ivars[i],
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

            if (ivarTypeIsClass && this.shouldWarnAbout("unknown-types"))
                this.checkForUnknownType(objj.type, typeName);

            buffer.concat(indentString(`\nnew objj_ivar("${ivarName}"`));

            if (this.options.typeSignatures)
                buffer.concat(`, "${typeName}"`);

            buffer.concat(")" + (i < lastIndex ? "," : ""));

            if (objj.isOutlet)
                ivar.isOutlet = true;

            classDef.addIvar(ivarName, ivar);

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

    addTypeDef(typedef)
    {
        this.typedefs.set(typedef.name, typedef);
        this.misspelledTypedefs.add(typedef.name);
    }

    getTypeDef(/* String */ name)
    {
        if (!name)
            return null;

        return this.typedefs.get(name) || null;
    }

    /*
        When a global symbol declaration is made, make sure it is not a duplicate
        of the same type of symbol, that it has not already been made for a
        different type of symbol, or that it is superfluous.

        Possible symbol types:

        @class
        @global
        @typedef
        global variables
        predefined global variables
        @implementation
        @implementation with category
        @protocol
    */
    isUniqueGlobalSymbol(node, scope, identifierNode)
    {
        const
            objj = node.objj,
            name = identifierNode.name;

        let problem = "previously defined as",
            previousType,
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

                    // Case #1
                    if (categoryDef)
                    {
                        return this.duplicateDefinitionException(
                            "category",
                            `${name} (${category})`,
                            false,
                            categoryDef.node,
                            node
                        );
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
                // Case #3
                if (def.node.type === "objj_ClassDeclaration")
                    return this.duplicateDefinitionException("class", name, false, def.node, node);

                // Case #4: If node is an @implementation and def is a @class,
                // warn but return true to pretend the @implementation is unique
                // so it can replace the @class.
                if (!this.options.ignoreWarnings)
                {
                    this.addWarning(def.node, "@class definition '%s' is unnecessary", name);
                    this.addNote(node, "superceded by this definition");
                }

                return true;
            }
        }
        else
        {
            // node is not an @implementation or category, see if the name is already defined as a class
            def = this.getClassDef(name);

            if (def)
            {
                if (node.type === "objj_ClassStatement")
                    return this.duplicateDefinitionException("class", name, true, def.node, identifierNode);

                previousNode = def.node;
                previousType = "a class";
            }
        }

        if (!previousType)
        {
            def = this.getProtocolDef(name);

            if (def)
            {
                if (node.type === "objj_ProtocolDeclaration")
                    return this.duplicateDefinitionException("protocol", name, true, def.node, node);

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
                    return this.duplicateDefinitionException("global", name, true, def.node, identifierNode);

                previousNode = def.node;
                previousType = "a global";
            }
        }

        if (!previousType)
        {
            def = this.getTypeDef(name);

            if (def)
            {
                if (node.type === "objj_TypeDefStatement")
                    return this.duplicateDefinitionException("typedef", name, true, def.node, identifierNode);

                previousNode = def.node;
                previousType = "a typedef";
            }
        }

        if (!previousType)
        {
            def = this.getPredefinedGlobal(name);

            if (def)
            {
                if (node.type === "objj_GlobalStatement")
                    return this.duplicateDefinitionException("predefined global", name, true, null, identifierNode);

                previousType = "a predefined global";
                problem = "is";
            }
        }

        if (previousType)
        {
            if (typeStatements.has(node.type))
                node = identifierNode;

            this.addError(node, `'${name}' ${problem} ${previousType}`);

            if (previousNode)
                this.addNote(previousNode, "definition is here");

            return false;
        }

        return true;
    }

    duplicateDefinitionException(definitionType, name, warn, originalNode, duplicateNode)
    {
        if (warn)
        {
            if (!this.options.ignoreWarnings)
            {
                this.addWarning(duplicateNode, "duplicate %s definition '%s' is ignored", definitionType, name);

                if (originalNode)
                    this.addNote(originalNode, "previous definition is here");
            }
        }
        else
        {
            this.addError(duplicateNode, "duplicate definition of %s '%s'", definitionType, name);

            if (originalNode)
                this.addNote(originalNode, "previous definition is here");
        }

        return false;
    }

    unknownProtocolException(node, isWarning)
    {
        let message = "cannot find protocol declaration for '%s'";
        const possibleName = this.misspelledProtocols.get(node.name);

        if (possibleName)
            message += `; did you mean '${possibleName}'?`;

        this[isWarning ? "addWarning" : "addError"](node, message, node.name);
    }

    /*
        This is only called in assignments or references in expressions, not for declared variables.
        Checks for the following conditions:

        - Assigning to a read-only predefined global
        - Implicitly creating a global var (via assignment) in a local scope
        - Referencing an unknown identifier as an rvalue
    */
    checkIdentifierReference(node, scope)
    {
        if (scope.assignment)
            this.checkAssignment(node, scope);
        else
            this.checkForUnknownIdentifier(node, scope);
    }

    checkAssignment(node, scope)
    {
        // Assignments to properties are not checked
        if (scope.isMemberParent)
            return;

        const identifier = node.name;
        let variable = this.getPredefinedGlobal(identifier);

        if (variable)
        {
            if (!variable.writable)
                this.addWarning(node, "assigning to a read-only predefined global");
        }
        else
        {
            // We need to know if this identifier is an implicit global
            // which is created by assigning to an identifier within a
            // local var scope.

            // First check to see if the identifier is known.
            variable = scope.getVar(identifier);

            // If it isn't a known variable, see if it's a known global symbol.
            // If so, we're done.
            if (!variable && !this.isUniqueGlobalSymbol(node, scope, node))
                return;

            // If we are in a local var scope and it isn't known, or if it's
            // an implicit global from a different scope, warn the user that
            // they are creating an implicit global.
            const isLocalScope = scope.isLocalVarScope();
            let implicitGlobal = isLocalScope &&
                (!variable || (variable.type === "implicit global" && variable.scope !== scope));

            // Are we in a local var scope? If so, this is an implicit global.
            if (implicitGlobal && this.shouldWarnAbout("implicit-globals"))
            {
                let message = "implicitly creating a global variable in the %s '%s'";

                const varDeclaration = this.constructor.findPreviousVarDeclaration(node);

                if (!varDeclaration)
                    message += "; did you mean to use 'var %s'?";

                const
                    // The local var scope could be a method or function
                    context = scope.selector || scope.functionName,
                    issue = this.addIssue(
                        exceptions.ImplicitGlobalWarning,
                        node,
                        message,
                        scope.functionName ? "function" : "method",
                        context,
                        identifier
                    );

                // We need to know which scope this issue/note was related to,
                // so that at the end of the scope we can remove the issue
                // if this identifier was later declared as a local var.
                issue.scope = scope;

                if (varDeclaration)
                {
                    /*
                        Construct a dummy node that has sufficient information
                        for the Issue class and for identifier issue filtering.
                        We want it to point to the end of the var declaration
                        and refer to the identifier being assigned to.
                    */
                    const
                        noteNode = {
                            start: varDeclaration.end - 1,
                            end: varDeclaration.end,
                            name: identifier,
                            sourceFile: varDeclaration.sourceFile
                        },
                        note = this.addIssue(
                            exceptions.ImplicitGlobalNote,
                            noteNode,
                            "did you mean to use a comma here?"
                        );

                    note.scope = scope;
                }
            }

            scope.rootScope().vars.set(identifier, {
                type: implicitGlobal ? "implicit global" : "global var",
                node,
                implicit: implicitGlobal,
                scope // record the scope
            });
        }
    }

    /**
     * @param {Node} identifierNode - Identifier that is a target of an assignment.
     * @returns {Node | null} - If the previous statement is a var declaration, return it, else null.
     */
    static findPreviousVarDeclaration(identifierNode)
    {
        let statement = Scope.previousStatement(identifierNode);

        /*
            We are looking for this kind of mistake:

            var a = 7,
                b = 13; <- mistake, this should be a comma
                c = 27,
                d = 31;

            In such a case, statement will be an ExpressionStatement whose
            expression property is either an AssignmentExpression (if there is
            only one assignment following the mistaken semicolon) or a
            SequenceExpression (if there is more than one following assignment).
        */

        if (statement.type !== "ExpressionStatement")
            return null;

        const expression = statement.expression;
        let assignments;

        switch (expression.type)
        {
            case "AssignmentExpression":
                assignments = [expression];
                break;

            case "SequenceExpression":
                assignments = expression.expressions;
                break;

            default:
                return null;
        }

        // Loop through the assignments, make sure one of them is assigning to dentifierNode
        let found = false;

        for (const assignment of assignments)
        {
            if (assignment.type !== "AssignmentExpression" || assignment.operator !== "=")
                continue;

            // Check to make sure the target of the assignment is the identifierNode.
            const target = assignment.left;

            if (target.start === identifierNode.start && target.end === identifierNode.end)
            {
                found = true;
                break;
            }
        }

        if (found)
        {
            statement = Scope.previousStatement(statement);

            // If we have a preceding var declaration, return it
            if (statement && statement.type === "VariableDeclaration")
                return statement;
        }

        return null;
    }

    findMisspelledName(name)
    {
        return this.misspelledClasses.get(name) ||
               this.misspelledProtocols.get(name) ||
               this.misspelledTypedefs.get(name) ||
               misspelledTypes.get(name);
    }

    checkForUnknownIdentifier(node, scope)
    {
        if (!this.shouldWarnAbout("unknown-identifiers"))
            return;

        const identifier = node.name;

        if (scope.getVar(identifier) === null &&
            this.getClassDef(identifier) === null &&
            this.getProtocolDef(identifier) === null &&
            this.getTypeDef(identifier) === null &&
            !this.isPredefinedGlobal(identifier))
        {
            let message = "reference to unknown identifier '%s'";

            // It could be a misspelled class/protocol name
            if (scope.receiver)
            {
                const name = this.findMisspelledName(identifier);

                if (name)
                    message += "; did you mean '" + name + "'?";
            }

            const issue = this.addIssue(
                exceptions.UnknownIdentifierWarning,
                node,
                message,
                identifier
            );

            // We need to know which scope this issue was related to
            issue.scope = scope;
        }
    }

    // Called for var declarations and function/method parameters
    checkForShadowedVars(node, scope, entityType)
    {
        const identifier = node.name;

        if (!this.shouldWarnAbout("shadowed-vars"))
            return;

        let def = scope.getVar(identifier),
            shadowedType,
            shadowedNode;

        if (def)
        {
            shadowedType = varTypes[def.type];

            // If the var is an implicit global in the same scope,
            // it means a local var declaration was made after assignment,
            // which is legal in Javascript. So we convert the original global
            // to a local.
            if (def.type === "implicit global" && def.scope === scope)
            {
                def.type = "local var";
                delete def.implicit;
                shadowedType = null;

                // When the original assignment was made, the var vas added
                // to the root scope as a global. It no longer is global.
                scope.rootScope().vars.delete(identifier);
            }
            else
                shadowedNode = def.node;
        }

        if (!shadowedType)
        {
            def = this.getClassDef(identifier);

            if (def)
            {
                shadowedType = "a class";
                shadowedNode = def.node;
            }
        }

        if (!shadowedType)
        {
            def = this.getProtocolDef(identifier);

            if (def)
            {
                shadowedType = "a protocol";
                shadowedNode = def.node;
            }
        }

        if (!shadowedType)
        {
            def = this.getTypeDef(identifier);

            if (def)
            {
                shadowedType = "a typedef";
                shadowedNode = def.node;
            }
        }

        if (!shadowedType)
        {
            def = this.getPredefinedGlobal(identifier);

            if (def && !def.ignoreShadow)
                shadowedType = "a predefined global";
        }

        if (!shadowedType)
        {
            const ivar = this.getIvarForCurrentClass(identifier, scope);

            if (ivar)
            {
                shadowedType = "an instance variable";
                shadowedNode = ivar.node;

                /*
                    Now we have to deal with a case like this:

                    @implementation Test
                    {
                        int one;
                        int two;
                    }

                    - (void)test
                    {
                        one = 7;

                        var one;
                    }
                    @end

                    In this case, the first reference to 'one' in the 'test' method
                    will be treated as an ivar reference. But when the same name is
                    declared as a var later, we have to convert the ivar reference
                    to a regular variable identifier and issue a warning that the reference
                    hides an ivar.
                */

                const ivarRefs = scope.getIvarRefs(identifier);

                if (ivarRefs)
                {
                    for (const ivarInfo of ivarRefs)
                    {
                        this.jsBuffer.remove(ivarInfo.index);

                        this.addWarning(
                            ivarInfo.node,
                            "reference to local variable '%s' hides an instance variable",
                            identifier
                        );
                    }

                    scope.ivarRefs.delete(identifier);
                }
            }
        }

        if (shadowedType)
        {
            this.addWarning(
                node,
                "%s '%s' hides %s",
                entityTypeDescriptions.get(entityType),
                identifier,
                shadowedType
            );

            if (shadowedNode)
                this.addNote(shadowedNode, "hidden declaration is here");
        }
    }

    /*
        Helper for code_generator.objjClassDeclaration

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
        const ivars = node.objj.ivars;

        indenter.indent();

        for (let i = 0, lastIndex = ivars.length - 1; i <= lastIndex; i++)
        {
            const
                ivar = ivars[i].objj,
                accessors = ivar.accessors;

            if (!accessors)
                continue;

            const
                ivarType = ivar.type ? ivar.type.objj.name : null,
                ivarName = ivar.id.name;

            let attributes = this.constructor.accessorAttributes(accessors),
                code = this.constructor.generateGetter(
                    classDef,
                    accessors,
                    attributes,
                    node,
                    ivarName,
                    ivarType
                );

            if (code)
                this.instanceMethods.push(code);

            if (accessors.readonly)
            {
                if (accessors.setter)
                {
                    this.addError(
                        accessors.setter,
                        "setter cannot be specified for a readonly ivar"
                    );
                }

                continue;
            }

            code = this.generateSetter(
                classDef,
                accessors,
                attributes,
                node,
                ivarName,
                ivarType
            );

            if (code)
                this.instanceMethods.push(code);
        }

        indenter.dedent();
    }

    static accessorAttributes(accessors)
    {
        let attributes = [];

        if (accessors.readonly)
            attributes.push("readonly");
        else if (accessors.copy)
            attributes.push("copy");

        if (accessors.property)
            attributes.push(`property=${accessors.property.name}`);

        if (accessors.getter)
            attributes.push(`getter=${accessors.getter.name}`);

        if (accessors.setter)
            // Strip trailing ':'
            attributes.push(`setter=${accessors.setter.name.replace(/(.+):$/, "$1")}`);

        if (attributes.length)
            return "(" + attributes.join(", ") + ")";

        return "";
    }

    static generateGetter(classDef, accessors, properties, node, ivarName, ivarType)
    {
        const selector = this.makeAccessorSelector(accessors, "getter", ivarName);

        if (classDef.getOwnInstanceMethod(selector))
            return "";

        classDef.addInstanceMethod(new MethodDef(selector, [ivarType]));

        const code = `
// ${ivarName} @accessors${properties} [getter]
// - (${ivarType})${selector}
new objj_method(sel_getUid("${selector}"),
function $${classDef.name}__${selector}(self, _cmd)
{
→return self.${ivarName};
},
// argument types
["${ivarType}"])`;

        return indentString(code);
    }

    generateSetter(classDef, accessors, properties, node, ivarName, ivarType)
    {
        let selector = this.constructor.makeAccessorSelector(accessors, "setter", ivarName);

        if (classDef.getOwnInstanceMethod(selector))
            return "";

        classDef.addInstanceMethod(new MethodDef(selector, ["void", ivarType]));

        let code;

        if (accessors.copy)
        {
            let messageSend;

            if (this.options.inlineMsgSend)
                messageSend = `(newValue.isa.method_msgSend["${selector}"] || _objj_forward)`;
            else
                messageSend = "newValue.isa.objj_msgSend0";

            // First line is indented by template below
            code =
`if (self.${ivarName} !== newValue)
→→/* ${ivarName} = [newValue copy] */ self.${ivarName} = newValue == null ? null : ${messageSend}(newValue, "copy");`;
        }
        else
            code = "self." + ivarName + " = newValue;";

        const argType = ivarType ? ivarType : "id";

        code = `
// ${ivarName} @accessors${properties} [setter]
// - (void)${selector}(${argType})newValue
new objj_method(sel_getUid("${selector}"),
function $${classDef.name}__${selector.slice(0, -1)}_(self, _cmd, newValue)
{
→${code}
},
// argument types
["void", "${argType}"])`;

        return indentString(code);
    }

    static makeAccessorSelector(accessors, type, ivarName)
    {
        let selector;

        if (accessors[type])
            selector = accessors[type].name.replace(/(.+):$/, "$1"); // strip trailing ':'
        else if (accessors.property)
            selector = accessors.property.name;
        else if (ivarName.charAt(0) === "_")
            selector = ivarName.substring(1);
        else
            selector = ivarName;

        if (type === "setter")
        {
            // If no "setter" property was specified, synthesize the setter selector
            if (!accessors[type])
                selector = `set${selector.charAt(0).toUpperCase()}${selector.substr(1)}`;

            selector += ":";
        }

        return selector;
    }

    /*
        Helper for code_generator.objjMethodDeclaration

        objj (for methods):

        methodType: string - "+" or "-"
        action: objj_ActionType node
        returnType: objj_ObjectiveJType node
        selectors: Array - Identifier nodes, one for each element in params
        params: Array - Objects with these keys/values:
            type: objj_ObjectiveJType node
            id: Identifier node
        takesVarArgs: boolean - true if signature ends with ", ..."
        body: BlockStatement node
    */
    compileMethod(node, scope, methodScope, params, types, compileNode)
    {
        const
            objj = node.objj,
            selector = this.makeSelector(scope, compileNode, params, types, objj.selectors);

        this.checkSetter(node, scope, selector);

        if (!scope.optionalProtocolMethods)
        {
            const
                compiler = scope.compiler,
                buffer = new StringBuffer(compiler),
                declaration = `
// ${objj.methodType}${selector}
new objj_method(sel_getUid("${selector}"),`;

            indenter.indent();
            buffer.concat(indentString(declaration));

            // If this is a protocol, the method will have no body
            if (objj.body)
            {
                buffer.concat(indentString("\nfunction"));

                if (this.options.methodNames)
                    buffer.concat(" $" + scope.currentClassName() + "__" + selector.replace(/:/g, "_"));

                buffer.concat("(self, _cmd");
                methodScope.methodType = objj.methodType;
                methodScope.selector = selector;

                // 'self' and '_cmd' are implicitly passed to every method
                methodScope.vars.set("self", { type: "self", scope: methodScope });
                methodScope.vars.set("_cmd", { type: "_cmd", scope: methodScope });

                for (const param of params)
                {
                    const paramName = param.id.name;

                    buffer.concat(", " + paramName);

                    if (paramName === "self")
                        this.addError(param.id, "'self' used as a method parameter");
                    else
                    {
                        // Check for shadowing before adding the parameter to the scope
                        this.checkForShadowedVars(param.id, methodScope, entityTypes.ENTITY_TYPE_METHOD);
                        methodScope.vars.set(paramName, { type: "method parameter", node: param.id });
                    }
                }

                buffer.concat(")");

                // Methods create a var scope
                objj.body.objjIsVarScope = true;

                // Temporarily set the compiler's buffer to our temp buffer
                const savedBuffer = this.jsBuffer;

                this.jsBuffer = buffer;
                compileNode(objj.body, methodScope);
                this.jsBuffer = savedBuffer;
            }
            else
                buffer.concat(" null");

            if (this.options.typeSignatures)
            {
                const signatures = types.map(type => `"${type}"`).join(", ");

                buffer.concat(",\n" + indentString(`// argument types\n[${signatures}]`));
            }

            buffer.concat(")");

            const methods = objj.methodType === "-" ? compiler.instanceMethods : compiler.classMethods;

            methods.push(buffer.toString());
            indenter.dedent();
        }

        return selector;
    }

    // If an ivar has a readonly @accessor, the class may not define an instance set method for that property
    checkSetter(node, scope, selector)
    {
        if (!scope.classDef || node.objj.methodType !== "-" || !selector.startsWith("set"))
            return;

        // Extract the potential ivar name, e.g. "something" from "setSomething:"
        const
            target = selector.slice(3, -1).toLowerCase(),
            ivars = scope.classDef.ivars;

        for (const entry of ivars)
        {
            const
                name = entry[0],
                ivar = entry[1].node,
                accessors = ivar.objj.accessors;

            if (name !== target || !accessors || !accessors.readonly)
                continue;

            const setter = "set" + name.charAt(0).toUpperCase() + name.substr(1) + ":";

            if (setter === selector)
            {
                this.addError(
                    node,
                    "setter method '%s' cannot be defined for the readonly ivar '%s'",
                    selector,
                    name
                );

                this.addNote(ivar, "ivar declaration is here");
            }
        }
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
            {
                let sourceMapPath = path.relative(this.options.sourceRoot, this.destPath);

                this.compiledCode += `//# sourceMappingURL=${sourceMapPath}.map\n`;
            }
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

    /**
     * @param {String} identifier - Name of the global to lookup.
     * @returns {null|{writable:boolean, ignoreShadow:boolean}} - Properties of the global if found, otherwise null.
     */
    getPredefinedGlobal(identifier)
    {
        const info = this.predefinedGlobals[identifier];

        if (info === undefined)
            return null;

        if (typeof info === "boolean")
            return { writable: info, ignoreShadow: false };

        return info;
    }

    isPredefinedGlobal(identifier)
    {
        return identifier in this.predefinedGlobals;
    }

    shouldWarnAbout(warning)
    {
        return !this.options.ignoreWarnings && this.options.warnings[warning];
    }

    filterIdentifierIssues(scope)
    {
        this.issues.filter(issue =>
        {
            if (issue.filterable && issue.scope === scope)
                return !issue.isValidInScope(scope);

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

    getRelativeSourcePath(sourcePath)
    {
        if (sourcePath === "<stdin>")
            return sourcePath;

        return this.constructor.getRelativeSourcePath(process.cwd(), sourcePath || this.sourcePath);
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
            compileNode = (node, scope, virtualType) =>
            {
                // jscs: enable

                const
                    buffer = this.jsBuffer,
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
exports.entityTypes = entityTypes;
