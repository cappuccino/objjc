"use strict";

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
    /**
     * Creates a new lexical scope.
     *
     * @param {Number} type - One of the Scope type constants at the end of this file.
     * @param {Scope|null} parent - Lexical parent of this scope.
     * @param {Object|undefined} properties - Extra properties for the scope, e.g. 'compiler'.
     */
    constructor(type, parent, properties)
    {
        this.type = type;
        this.vars = new Map();

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

        // istanbul ignore next: no need to test
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

    /**
     * @param {acorn.Node} node - A node from which to start searching
     * @returns {acorn.Node | undefined} - If node is a statement node or a parent node,
     * return the previous statement node. Otherwise return the current non-parent node.
     * For example, if node is the identifier in an assignment, the current statement
     * is an ExpressionStatement. If node is the identifier in a for init, there is
     * no previous non-parent node within the for statement, so the result is undefined.
     */
    static previousStatement(node)
    {
        // If the current node is a parent, look at its parent's statements
        const isParent = node && parentNodeTypes.has(node.type);
        let previous,
            statementNodes;

        if (isParent)
        {
            const parent = Scope.parentNodes[Scope.parentNodes.length - 2];

            statementNodes = parent ? parent.statementNodes : null;
        }
        else
            statementNodes = Scope.statementNodes;

        if (statementNodes && statementNodes.length > 0)
        {
            // Start at the top of the stack, which is the current statement
            let index = statementNodes.length - 1;

            // If the node is a parent or a statement, return the previous statement.
            // Otherwise return the current statement, node is within that.
            if (isParent || (node && statementNodeTypes.has(node.type)))
                --index;

            previous = statementNodes[index];
        }

        return previous;
    }

    static previousStatementType(node)
    {
        const statement = this.previousStatement(node);

        return statement ? statement.type : null;
    }

    static parentNode(node, index)
    {
        // The current parent is the top of the stack, so go one below that
        index = index || 0;

        if (node && parentNodeTypes.has(node.type))
            ++index;

        const parent = Scope.parentNodes[Scope.parentNodes.length - (1 + index)];

        return parent ? parent.node : /* istanbul ignore next: failsafe */ null;
    }

    // <index> is zero-based positive number from end of stack
    static parentNodeType(node, index)
    {
        const parentNode = this.parentNode(node, index);

        return parentNode ? parentNode.type : /* istanbul ignore next: failsafe */ null;
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

    close()
    {
        delete this.receiverLevel;
        delete this.maxReceiverLevel;
    }

    rootScope()
    {
        return this.root;
    }

    isLocalVarScope()
    {
        let scope = this;

        do
        {
            if (Scope.localVarScopes.has(scope.type))
                return true;

            scope = scope.parent;
        }
        while (scope);

        return false;
    }

    currentClass()
    {
        let self = this;

        while (self && !self.classDef)
            self = self.parent;

        return self ? self.classDef : /* istanbul ignore next: failsafe */ null;
    }

    currentClassName()
    {
        const curClass = this.currentClass();

        return curClass ? curClass.name : /* istanbul ignore next: failsafe */ null;
    }

    /* Currently not used, maybe in the future
    currentProtocolName()
    {
        let self = this;

        while (self && !self.protocolDef)
            self = self.parent;

        return self ? self.protocolDef.name : null;
    }
    */

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
            const localVar = scope.vars.get(name);

            if (localVar)
                return localVar;

            // If we are only looking for a local var and it wasn't found
            // in this scope, we're done.
            if (type === Scope.Type.BLOCK)
                return null;

            /*
                If:

                - we are looking for a local var scope
                - the current scope is the one we are looking for
                - and we didn't find the name

                then we're done.
            */
            // istanbul ignore if: currently unused but important failsafe
            else if (Scope.localVarScopes.has(type) && type === scope.type)
                return null;

            // Otherwise keep looking
            scope = scope.parent;
        }
        while (scope);

        return null;
    }

    getObjjMethodVar(name)
    {
        return this.getVar(name, Scope.Type.OBJJ_METHOD);
    }

    getLocalVar(name)
    {
        return this.getVar(name, Scope.Type.BLOCK);
    }

    getGlobalVar(name)
    {
        const global = this.rootScope().vars.get(name);

        if (global && (globalVarTypes.has(global.type)))
            return global;

        return null;
    }

    currentObjjMethodScope()
    {
        let scope = this;

        while (scope && scope.type !== Scope.Type.OBJJ_METHOD)
            scope = scope.parent;

        return scope;
    }

    currentObjjMethodType()
    {
        let scope = this.currentObjjMethodScope();

        return scope ? scope.methodType : null;
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

            for (const entry of this.ivarRefs)
            {
                const
                    key = entry[0],
                    ivarRef = entry[1];

                // istanbul ignore else
                if (!ivarRefs.has(key))
                    ivarRefs.set(key, []);

                const parentIvarRefs = ivarRefs.get(key);

                // Append at end in parent scope
                parentIvarRefs.push(...ivarRef);
            }
        }
    }
}

// Scope types
Scope.Type = {
    GLOBAL: 0,
    FILE: 1,
    FUNCTION: 2,
    BLOCK: 3,
    CLASS: 4,
    OBJJ_CLASS: 5,
    OBJJ_PROTOCOL: 6,
    METHOD: 7,
    OBJJ_METHOD: 8
};

Scope.localVarScopes = new Set([Scope.Type.FUNCTION, Scope.Type.METHOD, Scope.Type.OBJJ_METHOD]);

module.exports = Scope;

Scope.stack = [];
Scope.statementNodes = [];
Scope.parentNodes = [];
