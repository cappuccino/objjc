"use strict";

const
    indentString = require("./indentation.js").indentString,
    StringBuffer = require("./stringbuffer.js");

const // jscs: ignore requireMultipleVarDecl
    statementNodeTypes = new Set([
        "BreakStatement",
        "ContinueStatement",
        "DebuggerStatement",
        "ExpressionStatement",
        "LabeledStatement",
        "ReturnStatement",
        "ThrowStatement",

        "objj_ClassStatement",
        "objj_GlobalStatement",
        "objj_IVarDeclaration",
        "objj_TypeDefStatement"
    ]),

    parentNodeTypes = new Set([
        "BlockStatement",
        "CaseStatement",
        "DoWhileStatement",
        "ElseIfStatement",
        "ElseStatement",
        "ForInStatement",
        "ForStatement",
        "FunctionDeclaration",
        "FunctionExpression",
        "IfStatement",
        "Lambda",
        "ObjectExpression",
        "Program",
        "SwitchStatement",
        "TryStatement",
        "VariableDeclaration",
        "WhileStatement",
        "WithStatement",

        "objj_ClassDeclaration",
        "objj_MethodDeclaration",
        "objj_ProtocolDeclaration"
    ]),

    globalVarTypes = new Set([
        "global var",
        "@global",
        "implicit global"
    ]);

class Scope
{
    constructor(type, parent, properties)
    {
        this.type = type;
        this.vars = Object.create(null);

        if (properties)
            Object.assign(this, properties);

        this.parent = parent;

        if (parent)
        {
            this.compiler = parent.compiler;

            let self = this;

            while (self.parent)
                self = self.parent;

            this.root = self;
        }
        else
            this.root = this;

        this.receiverLevel = 0;
        this.maxReceiverLevel = 0;
    }

    static pushNode(node)
    {
        /*
            We keep track of two things:

            - A stack of parent node types.
            - A list of statements types within a parent.

            This allows us to know what the previous statement
            at the current level is, which is used for formatting.
        */
        if (parentNodeTypes.has(node.type))
        {
            // Parent nodes are also statements, so push this node type onto the list of statements
            // for the previous parent, then start a new list.
            let parent = Scope.parentNodes[Scope.parentNodes.length - 1];

            if (parent)
                parent.statementNodes.push(node);

            parent = {
                node,
                statementNodes: []
            };

            Scope.parentNodes.push(parent);
            Scope.statementNodes = parent.statementNodes;
        }
        else if (statementNodeTypes.has(node.type))
            Scope.statementNodes.push(node);

        if (DEBUG)
        {
            const
                debugPrevious = this.previousStatementType(node),
                debugParent = this.parentNodeType(node);

            console.log(
                "%s, <%s, ^%s",
                node.type,
                debugPrevious || "null",
                debugParent || "null"
            );
        }
    }

    static popNode(node)
    {
        if (parentNodeTypes.has(node.type))
        {
            // If the node is a parent, pop it and set the statement list
            // to the previous parent's list.
            Scope.parentNodes.pop();

            const parent = Scope.parentNodes[Scope.parentNodes.length - 1];

            if (parent)
                Scope.statementNodes = parent.statementNodes;
        }
    }

    static previousStatementType(node)
    {
        // If the current node is a parent, look at its parent's statements
        const isParent = node && parentNodeTypes.has(node.type);
        let previous,
            statementNodes;

        if (isParent)
        {
            const parent = Scope.parentNodes[Scope.parentNodes.length - 2];

            if (parent)
                statementNodes = parent.statementNodes;
        }
        else
            statementNodes = Scope.statementNodes;

        if (statementNodes)
        {
            // The current statement is the top of the stack, so go one below that
            let index = 1;

            if (isParent || (node && statementNodeTypes.has(node.type)))
                ++index;

            previous = statementNodes[statementNodes.length - index];
        }

        return previous ? previous.type : null;
    }

    // <index> is zero-based positive number from end of stack
    static parentNodeType(node, index)
    {
        // The current parent is the top of the stack, so go one below that
        index = index || 0;

        if (node && parentNodeTypes.has(node.type))
            ++index;

        const parent = Scope.parentNodes[Scope.parentNodes.length - (1 + index)];

        return parent ? parent.node.type : null;
    }

    incrementReceiverLevel()
    {
        this.receiverLevel++;
        this.maxReceiverLevel = Math.max(this.maxReceiverLevel, this.receiverLevel);
    }

    decrementReceiverLevel()
    {
        this.receiverLevel--;
    }

    closeVarScope()
    {
        if (this.maxReceiverLevel)
        {
            const buffer = this.compiler.jsBuffer;

            buffer.concat(indentString("\n\n// Generated receiver temp variables\nvar "));

            for (let i = 0; i < this.maxReceiverLevel; i++)
            {
                if (i > 0)
                    buffer.concat(", ");

                buffer.concat(StringBuffer.RECEIVER_TEMP_VAR + (i + 1));
            }

            buffer.concat(";");
        }

        delete this.receiverLevel;
        delete this.maxReceiverLevel;
        delete this.objjIsVarScope;
    }

    getCompiler()
    {
        return this.compiler;
    }

    rootScope()
    {
        return this.root;
    }

    isRootScope()
    {
        return !this.parent;
    }

    isLocalVarScope()
    {
        let scope = this;

        while (scope)
        {
            if (Scope.localVarScopes.has(scope.type))
                return true;

            scope = scope.parent;
        }

        return false;
    }

    currentClass()
    {
        let self = this;

        while (self && !self.classDef)
            self = self.parent;

        return self ? self.classDef : null;
    }

    currentClassName()
    {
        const curClass = this.currentClass();

        return curClass ? curClass.name : null;
    }

    currentProtocolName()
    {
        let self = this;

        while (self && !self.protocolDef)
            self = self.parent;

        return self ? self.protocolDef.name : null;
    }

    addIvarRef(node, identifier, ivar)
    {
        const
            compiler = this.compiler,
            buffer = compiler.jsBuffer;

        // Save the index of where the "self." string is stored along with the node.
        // These will be used if we find a variable declaration that is hoisting this identifier.
        if (!this.ivarRefs)
            this.ivarRefs = new Map();

        if (!this.ivarRefs.has(identifier))
            this.ivarRefs.set(identifier, []);

        this.ivarRefs.get(identifier).push(
            {
                ivar: ivar.node,
                node,
                index: buffer.length
            }
        );

        buffer.concat("self.", node);
    }

    getIvarRefs(identifier)
    {
        return this.ivarRefs ? this.ivarRefs.get(identifier) : null;
    }

    getVar(name, type)
    {
        let scope = this;

        do
        {
            if (scope.vars)
            {
                const localVar = scope.vars[name];

                if (localVar)
                    return localVar;
            }

            // If we are only looking for a local var and it wasn't found
            // in this scope, we're done.
            if (type === Scope.BLOCK)
                return null;

            // If we are looking for a method scope, the current scope
            // is a method, and we didn't find the name, we're done
            else if (type === Scope.OBJJ_METHOD && scope.type === Scope.OBJJ_METHOD)
                return null;

            // Otherwise keep looking
            scope = scope.parent;
        }
        while (scope);

        return null;
    }

    getObjjMethodVar(name)
    {
        return this.getVar(name, Scope.OBJJ_METHOD);
    }

    getLocalVar(name)
    {
        return this.getVar(name, Scope.BLOCK);
    }

    getGlobalVar(name)
    {
        const global = this.rootScope().vars[name];

        if (global && (globalVarTypes.has(global.type)))
            return global;

        return null;
    }

    currentObjjMethodScope()
    {
        let scope = this;

        while (scope && scope.type !== Scope.OBJJ_METHOD)
            scope = scope.parent;

        return scope;
    }

    currentObjjMethodType()
    {
        let scope = this.currentObjjMethodScope();

        return scope ? scope.methodType : null;
    }

    currentVarScope()
    {
        let scope = this;

        while (scope && scope.type !== Scope.GLOBAL && !Scope.localVarScopes.has(scope.type))
            scope = scope.parent;

        return scope;
    }

    copyIvarRefsToParent()
    {
        const parent = this.parent;

        if (parent && this.ivarRefs)
        {
            let ivarRefs = parent.ivarRefs;

            if (!ivarRefs)
            {
                parent.ivarRefs = new Map();
                ivarRefs = parent.ivarRefs;
            }

            for (const entry in this.ivarRefs.entries())
            {
                const
                    key = entry[0],
                    ivarRef = entry[1];

                if (!ivarRefs.has(key))
                    ivarRefs.set(key, []);

                const parentIvarRefs = ivarRefs.get(key);

                // Append at end in parent scope
                parentIvarRefs.push(...ivarRef);
            }
        }
    }
}

Scope.GLOBAL = 0;
Scope.FUNCTION = 1;
Scope.BLOCK = 2;
Scope.CLASS = 3;
Scope.OBJJ_CLASS = 4;
Scope.OBJJ_PROTOCOL = 5;
Scope.METHOD = 6;
Scope.OBJJ_METHOD = 7;

Scope.localVarScopes = new Set([Scope.FUNCTION, Scope.METHOD, Scope.OBJJ_METHOD]);

module.exports = Scope;

Scope.stack = [];
Scope.statementNodes = [];
Scope.parentNodes = [];
