"use strict";

const
    entityTypes = require("./compiler.js").entityTypes,
    globals = require("./globals.js"),
    language = require("./language.js"),
    indentation = require("./indentation.js"),
    Scope = require("./scope.js"),
    StringBuffer = require("./stringbuffer.js"),
    walk = require("acorn/dist/walk");

const // jscs: ignore requireMultipleVarDecl
    indenter = indentation.indenter,
    indentString = indentation.indentString,
    MethodDef = language.MethodDef,
    ProtocolDef = language.ProtocolDef,
    TypeDef = language.TypeDef,

    wordPrefixOperators = new Set([
        "delete",
        "in",
        "instanceof",
        "new",
        "typeof",
        "void"
    ]);

// Node handlers

function program(node, scope, compileNode)
{
    const compiler = scope.compiler;
    let indent = compiler.format.getGlobal("indent-string"),
        indentWidth = compiler.format.getGlobal("indent-width");

    indent = indent || compiler.defaultOptions.indentString;
    indentWidth = indentWidth || compiler.defaultOptions.indentWidth;
    indenter.setIndent(indent, indentWidth);

    for (const bodyNode of node.body)
        compileNode(bodyNode, scope);

    compiler.filterIdentifierIssues(scope);
}

function blockStatement(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    buffer.concatWithFormat(node, scope, "{", "left-brace");

    for (const bodyNode of node.body)
        compileNode(bodyNode, scope);

    if (node.objjIsVarScope)
        scope.closeVarScope();

    buffer.concatWithFormat(node, scope, "}", "right-brace");
}

function expressionStatement(node, scope, compileNode)
{
    compileNode(node.expression, scope);
}

function ifStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        alternate = node.alternate;

    buffer.concat("if", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
    compiler.constructor.compileDependentStatement(node.consequent, scope, compileNode);

    if (alternate)
    {
        buffer.concatWithFormat(node, scope, "else", null, true);

        if (alternate.type === "IfStatement")
        {
            alternate.type = "ElseIfStatement";
            compileNode(alternate, scope);
        }
        else
        {
            // Compile a dummy "ElseStatement" node so we can get a parent
            // inserted in the hierarchy.
            const elseNode = {
                type: "ElseStatement",
                statement: alternate
            };

            compileNode(elseNode, scope);
        }
    }
}

function elseIfStatement(node, scope, compileNode)
{
    ifStatement(node, scope, compileNode);
}

function elseStatement(node, scope, compileNode)
{
    scope.compiler.constructor.compileDependentStatement(node.statement, scope, compileNode);
}

function labeledStatement(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    buffer.concat(node.label.name, node);
    buffer.concatWithFormat(node, scope, ":", "colon");
    compileNode(node.body, scope);
}

function breakStatement(node, scope)
{
    const
        label = node.label,
        buffer = scope.compiler.jsBuffer;

    if (label)
    {
        buffer.concatWithFormats(node, scope, null, "break", "before-label", true);
        buffer.concat(label.name);
    }
    else
        buffer.concat("break", node);
}

function continueStatement(node, scope)
{
    const
        label = node.label,
        buffer = scope.compiler.jsBuffer;

    if (label)
    {
        buffer.concatWithFormats(node, scope, null, "continue", "before-label", true);
        buffer.concat(label.name);
    }
    else
        buffer.concat("continue", node);
}

function withStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("with", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.object);
    compiler.constructor.compileDependentStatement(node.body, scope, compileNode);
}

function switchStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("switch", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.discriminant);
    buffer.concatWithFormat(node, scope, "{", "left-brace");

    for (let i = 0; i < node.cases.length; i++)
    {
        const cs = node.cases[i];

        if (cs.test)
        {
            buffer.concatWithFormats(node, scope, "before-case", "case ", null, true);
            compileNode(cs.test, scope);
            buffer.concatWithFormat(node, scope, ":", "colon");
        }
        else
        {
            buffer.concatWithFormats(node, scope, "before-case", "default", null, true);
            buffer.concatWithFormat(node, scope, ":", "colon");
        }

        if (cs.consequent.length > 0)
        {
            indenter.indent();

            for (const consequentNode of cs.consequent)
            {
                // Compile a dummy "CaseStatement" node so we can get a parent
                // inserted in the hierarchy.
                const caseNode = {
                    type: "CaseStatement",
                    statement: consequentNode
                };

                compileNode(caseNode, scope);
            }

            indenter.dedent();

            if (i < node.cases.length - 1)
                buffer.concatFormat(node, scope, "between-case-blocks");
        }
    }

    buffer.concatWithFormat(node, scope, "}", "right-brace");
}

function caseStatement(node, scope, compileNode)
{
    compileNode(node.statement, scope);
}

function returnStatement(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    buffer.concat("return" + (node.argument ? " " : ""), node);

    if (node.argument)
        compileNode(node.argument, scope);
}

function throwStatement(node, scope, compileNode)
{
    scope.compiler.jsBuffer.concat("throw ", node);
    compileNode(node.argument, scope);
}

function tryStatement(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    buffer.concat("try", node);
    compileNode(node.block, scope);

    if (node.handler)
    {
        const
            handler = node.handler,
            param = handler.param,
            name = param.name;

        // Inject the catch variable into the scope
        scope.vars.set(name, { type: "local var", node: param });

        buffer.concatWithFormats(node, scope, "before-catch", "catch", null, true);
        buffer.concatLeftParens(node, scope);
        buffer.concat(param.name);
        buffer.concatRightParens(node, scope);

        compileNode(handler.body, scope);

        scope.vars.delete(name);
    }

    if (node.finalizer)
    {
        buffer.concatWithFormats(node, scope, "before-finally", "finally");
        compileNode(node.finalizer, scope);
    }
}

function whileStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("while", node);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
    compiler.constructor.compileDependentStatement(node.body, scope, compileNode);
}

function doWhileStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("do", node);
    compiler.constructor.compileDependentStatement(node.body, scope, compileNode);

    buffer.concatWithFormat(node, scope, "while", "do-while", true);
    compiler.concatParenthesizedExpression(node, scope, compileNode, node.test);
}

function forStatement(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat("for", node);
    buffer.concatLeftParens(node, scope);

    if (node.init)
        compileNode(node.init, scope);

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.test)
        compileNode(node.test, scope);

    buffer.concatWithFormats(node, scope, "after-init-expression", ";", "after-init-semicolon");

    if (node.update)
        compileNode(node.update, scope);

    buffer.concatRightParens(node, scope);
    compiler.constructor.compileDependentStatement(node.body, scope, compileNode);
}

function forInStatement(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    buffer.concat("for", node);

    buffer.concatLeftParens(node, scope);
    compileNode(node.left, scope);
    buffer.concatWithFormat(node, scope, "in");
    compileNode(node.right, scope);
    buffer.concatRightParens(node, scope);

    scope.compiler.constructor.compileDependentStatement(node.body, scope, compileNode);
}

function debuggerStatement(node, scope)
{
    const compiler = scope.compiler;

    compiler.jsBuffer.concat("debugger", node);

    if (compiler.shouldWarnAbout("debugger"))
        compiler.addWarning(node, "debugger statement");
}

function functionNode(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        inner = new Scope(Scope.FUNCTION, scope),
        isDeclaration = node.type === "FunctionDeclaration",
        id = node.id,
        transformDeclaration = id && isDeclaration && compiler.options.objjScope && !scope.isLocalVarScope();

    inner.isDeclaration = isDeclaration;
    inner.functionName = id ? id.name : "<anonymous>";

    for (const param of node.params)
    {
        let valid = true;

        if (param.name === "self")
        {
            if (scope.currentObjjMethodScope())
            {
                valid = false;
                compiler.addError(param, "'self' used as a function parameter within a method");
            }
        }

        if (valid)
        {
            compiler.checkForShadowedVars(param, inner, entityTypes.ENTITY_TYPE_FUNCTION);
            inner.vars.set(param.name, { type: "function parameter", node: param });
        }
    }

    if (id)
    {
        if (isDeclaration)
            scope.vars.set(id.name,  { type: "function", node: id });
        else
            inner.vars.set(id.name, { type: "function name", node: id });

        /*
            If we are compiling an Objective-J file and this is a function declaration
            in the global scope, we convert it to a function expression. This is necessary
            because Cappuccino wraps Objective-J files in a function to provide file-level
            scope for vars. So functions declared at the global level in a Cappuccino
            source file actually end up in a local scope. To make them available globally
            (as would be expected), we convert them to a function expression assigned to
            a global variable with the function name.
        */
        if (transformDeclaration)
        {
            buffer.concat(id.name, node);
            buffer.concatOperator(node, scope, "=");
        }
    }

    buffer.concat("function", node);

    if (id)
        buffer.concat(" " + id.name);

    buffer.concatLeftParens(node, scope);

    for (let i = 0; i < node.params.length; i++)
    {
        if (i > 0)
            buffer.concatComma(node, scope);

        buffer.concat(node.params[i].name);
    }

    buffer.concatRightParens(node, scope);

    // A one-line or empty function expression in an object is considered a lambda
    const isLambda =
        !isDeclaration &&
        node.body.body.length <= 1 &&
        scope.constructor.parentNodeType(node) === "ObjectExpression";

    if (isLambda)
        node.body.type = "Lambda";

    // Functions create a var scope
    node.body.objjIsVarScope = true;
    compileNode(node.body, inner);

    if (transformDeclaration)
        buffer.concat(";");

    inner.copyIvarRefsToParent();
    compiler.filterIdentifierIssues(inner);
}

function lambda(node, scope, compileNode)
{
    blockStatement(node, scope, compileNode);
}

function variableDeclaration(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        isLocalScope = scope.isLocalVarScope();

    buffer.concat("var ", node);

    for (let i = 0; i < node.declarations.length; i++)
    {
        const
            decl = node.declarations[i],
            identifier = decl.id.name;

        if (i > 0)
            buffer.concatComma(node, scope);

        if (identifier in globals.reserved)
            compiler.addWarning(decl.id, "reserved word used as a variable name");

        else if (identifier in globals.cappuccino && scope.currentObjjMethodScope())
            compiler.addError(decl.id, "local declaration of '%s' hides implicit method parameter", identifier);

        else
            compiler.checkForShadowedVars(decl.id, scope, entityTypes.ENTITY_TYPE_VAR);

        scope.vars.set(identifier, {
            type: isLocalScope ? "local var" : "file var",
            node: decl.id
        });

        buffer.concat(decl.id.name, decl.id);

        if (decl.init)
        {
            buffer.concatWithFormat(node, scope, "=", "assign");
            compileNode(decl.init, scope);
        }
    }
}

function thisExpression(node, scope)
{
    scope.compiler.jsBuffer.concat("this", node);
}

function arrayExpression(node, scope, compileNode)
{
    const
        buffer = scope.compiler.jsBuffer,
        singleLineLimit = scope.compiler.format.getGlobal("single-line-array-limit"),
        singleLine = node.elements.length <= singleLineLimit,
        prefix = singleLine ? "single-" : "";

    buffer.concatWithFormat(node, scope, "[", prefix + "left-bracket", true);

    for (let i = 0; i < node.elements.length; i++)
    {
        const element = node.elements[i];

        if (i > 0)
            buffer.concatWithFormat(node, scope, ",", prefix + "comma");

        if (element)
            compileNode(element, scope);
    }

    buffer.concatWithFormat(node, scope, "]", prefix + "right-bracket");
}

function objectExpression(node, scope, compileNode)
{
    const
        properties = node.properties,
        buffer = scope.compiler.jsBuffer;

    let selector = properties.length > 0 ? "left-brace" : "empty-left-brace";

    buffer.concatWithFormat(node, scope, "{", selector);

    for (let i = 0; i < properties.length; i++)
    {
        const property = properties[i];

        if (i)
            buffer.concatComma(node, scope);

        buffer.concatFormat(node, scope, "before-property");
        scope.isPropertyKey = true;
        compileNode(property.key, scope);
        delete scope.isPropertyKey;

        buffer.concatWithFormat(node, scope, ":", "colon");
        compileNode(property.value, scope);
    }

    selector = properties.length > 0 ? "right-brace" : "empty-right-brace";
    buffer.concatWithFormat(node, scope, "}", selector);
}

function sequenceExpression(node, scope, compileNode)
{
    const buffer = scope.compiler.jsBuffer;

    for (let i = 0; i < node.expressions.length; i++)
    {
        if (i !== 0)
            buffer.concatComma(node, scope);

        compileNode(node.expressions[i], scope);
    }
}

function unaryExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    buffer.concat(node.operator, node);

    if (wordPrefixOperators.has(node.operator))
        buffer.concat(" ");

    compiler.concatPrecedenceExpression(node, node.argument, scope, compileNode);
}

function updateExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    if (node.argument.type === "objj_Dereference")
    {
        /*
            objj:

            ref: Expression node - The reference to deref
        */
        const ref = node.argument.objj.ref;

        // Output the dereference function, "(...)(z)"
        buffer.concat("/* ");

        if (node.prefix)
            buffer.concat(node.operator + "@deref(" + ref.name + ") */", node);
        else
        {
            buffer.concat("@deref(" + ref.name + ")" + node.operator + " */", node);
            buffer.concatLeftParens(node, scope);
        }

        buffer.concatLeftParens(node, scope);
        compileNode(ref, scope);
        buffer.concatRightParens(node, scope);

        buffer.concatLeftParens(node, scope);
        compileNode(node.argument, scope);
        buffer.concatOperator(node, scope, node.operator.charAt(0));
        buffer.concat("1");
        buffer.concatRightParens(node, scope);

        if (!node.prefix)
        {
            buffer.concatOperator(node, scope, node.operator === "++" ? "-" : "+");
            buffer.concat("1");
            buffer.concatRightParens(node, scope);
        }
    }
    else if (node.prefix)
    {
        buffer.concat(node.operator, node);

        if (wordPrefixOperators.has(node.operator))
            buffer.concat(" ");

        compiler.concatPrecedenceExpression(node, node.argument, scope, compileNode);
    }
    else
    {
        compiler.concatPrecedenceExpression(node, node.argument, scope, compileNode);
        buffer.concat(node.operator);
    }
}

function binaryOrLogicalExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.left, scope, compileNode);
    buffer.concatOperator(node, scope);
    compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
}

function assignmentExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        target = node.left;

    if (target.type === "objj_Dereference")
    {
        /*
            objj:

            ref: Expression node - The reference to deref
        */

        // Output the dereference function, "(...)(z)"
        compiler.concatParenthesizedExpression(node, scope, compileNode, target.objj.ref);
        buffer.concatLeftParens(node, scope);

        // Now "(x)(...)". We have to manually expand +=, -=, *= etc.
        if (node.operator === "=")
            compiler.checkCanDereference(node);
        else
        {
            compileNode(target, scope);
            buffer.concatOperator(node, scope, node.operator.charAt(0));
        }

        compileNode(node.right, scope);
        buffer.concatRightParens(node, scope);
    }
    else
    {
        const assignment = scope.assignment;

        scope.assignment = true;

        if (target.type === "Identifier" && target.name === "self")
        {
            const selfVar = scope.getObjjMethodVar("self");

            if (selfVar && selfVar.type === "self")
                selfVar.scope.assignmentToSelf = true;
        }

        compiler.concatPrecedenceExpression(node, target, scope, compileNode);
        buffer.concatOperator(node, scope);
        scope.assignment = assignment;
        compiler.concatPrecedenceExpression(node, node.right, scope, compileNode, true);
    }
}

function conditionalExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.concatPrecedenceExpression(node, node.test, scope, compileNode);
    buffer.concatOperator(node, scope, "?");
    compileNode(node.consequent, scope);
    buffer.concatOperator(node, scope, ":");
    compileNode(node.alternate, scope);
}

function makeCompileArgsFunc(node, scope, buffer, args, compileNode)
{
    return () =>
    {
        for (let i = 0; i < args.length; i++)
        {
            if (i > 0)
                buffer.concatComma(node, scope);

            compileNode(args[i], scope);
        }
    };
}

function newExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer;

    buffer.concat("new ", node);
    compiler.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    let args;

    if (nodeArguments && nodeArguments.length)
        args = makeCompileArgsFunc(node, scope, buffer, nodeArguments, compileNode);

    buffer.concatParenthesizedBlock(node, scope, args);
}

function callExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        nodeArguments = node.arguments,
        buffer = compiler.jsBuffer;

    // If call to function 'eval' we assume that 'self' can be altered and from this point
    // we check if 'self' is null before 'objj_msgSend' is called with 'self' as receiver.
    if (node.callee.type === "Identifier" && node.callee.name === "eval")
    {
        const selfVar = scope.getObjjMethodVar("self");

        if (selfVar && selfVar.type === "self")
            selfVar.scope.assignmentToSelf = true;
    }

    compiler.concatPrecedenceExpression(node, node.callee, scope, compileNode);

    let func;

    if (nodeArguments.length > 0)
        func = makeCompileArgsFunc(node, scope, buffer, nodeArguments, compileNode);

    buffer.concatParenthesizedBlock(node, scope, func);
}

function memberExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        computed = node.computed;

    // We need to know that the identifier is the parent of a member expression so that
    // if it is an ivar a reference will be added, but assignment checks will not be done.
    scope.isMemberParent = true;
    compiler.concatPrecedenceExpression(node, node.object, scope, compileNode);
    delete scope.isMemberParent;

    if (computed)
        buffer.concatWithFormat(node, scope, "[", "left-bracket");
    else
        buffer.concat(".");

    scope.isMemberExpression = true;
    compileNode(node.property, scope);
    delete scope.isMemberExpression;

    if (computed)
        buffer.concatWithFormat(node, scope, "]", "right-bracket");
}

function identifierNode(node, scope)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        identifier = node.name;

    // We only check the validity of variables, not their properties
    let valid = scope.isMemberExpression || scope.isPropertyKey;

    if (!valid && scope.isLocalVarScope())
    {
        const localVar = scope.getLocalVar(identifier);

        if (localVar)
            valid = true;
        else
        {
            const methodType = scope.currentObjjMethodType();

            if (methodType === "-")
            {
                // If we see a standalone identifier within an instance method,
                // we have to figure out if it's an ivar
                const ivar = compiler.getIvarForCurrentClass(identifier, scope);

                if (ivar)
                {
                    scope.addIvarRef(node, identifier, ivar);
                    valid = true;
                }
            }
        }
    }

    buffer.concat(identifier, node);

    if (!valid)
        compiler.checkIdentifierReference(node, scope);

    // This flag is set to allow receivers to be checked for misspelling.
    // Once that check has been made once, remove the flag so multiple
    // warnings are not made for a single receiver.
    delete scope.receiver;
}

function literal(node, scope)
{
    const buffer = scope.compiler.jsBuffer;

    if (node.raw.charAt(0) === "@")
        buffer.concat(node.raw.substring(1), node);
    else
        buffer.concat(node.raw, node);
}

/*
    objj:

    elements: Array - Expression nodes
*/
function objjArrayLiteral(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        inline = compiler.options.inlineMsgSend,
        buffer = compiler.jsBuffer,
        elements = node.objj.elements;

    scope.incrementReceiverLevel();

    const
        tempVar = StringBuffer.RECEIVER_TEMP_VAR + scope.receiverLevel,
        inlineParens = inline ? "(" : "";

    buffer.concat("(" + tempVar);

    if (inline)
        buffer.concat(" = (CPArray.isa.method_msgSend[\"alloc\"] || _objj_forward)");
    else
        buffer.concat(" = CPArray.isa.objj_msgSend0");

    buffer.concat(`(CPArray, "alloc"), ${tempVar} == null ? null : ${inlineParens}${tempVar}`);

    if (elements.length)
    {
        if (inline)
            buffer.concat(".isa.method_msgSend[\"initWithObjects:count:\"] || _objj_forward)");
        else
            buffer.concat(".isa.objj_msgSend2");

        buffer.concat("(" + tempVar + ", \"initWithObjects:count:\", [");

        for (let i = 0; i < elements.length; i++)
        {
            const element = elements[i];

            if (i)
                buffer.concat(", ");

            compileNode(element, scope);
        }

        buffer.concat("], " + elements.length + "))");
    }
    else
    {
        if (inline)
            buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)");
        else
            buffer.concat(".isa.objj_msgSend0");

        buffer.concat("(" + tempVar + ", \"init\"))");
    }

    scope.decrementReceiverLevel();
}

/*
    objj:

    keys: Array - Expression nodes
    values: Array - Expression nodes
*/
function objjDictionaryLiteral(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        inline = compiler.options.inlineMsgSend,
        buffer = compiler.jsBuffer,
        keys = node.objj.keys,
        values = node.objj.values,
        numKeys = keys.length;

    scope.incrementReceiverLevel();

    const
        tempVar = StringBuffer.RECEIVER_TEMP_VAR + scope.receiverLevel,
        inlineParens = inline ? "(" : "";

    buffer.concat("(" + tempVar);

    if (inline)
        buffer.concat(" = (CPDictionary.isa.method_msgSend[\"alloc\"] || _objj_forward)");
    else
        buffer.concat(" = CPDictionary.isa.objj_msgSend0");

    buffer.concat(`(CPDictionary, "alloc"), ${tempVar} == null ? null : ${inlineParens}${tempVar}`);

    if (numKeys === 0)
    {
        if (inline)
            buffer.concat(".isa.method_msgSend[\"init\"] || _objj_forward)");
        else
            buffer.concat(".isa.objj_msgSend0");

        buffer.concat("(" + tempVar + ", \"init\"))");
    }
    else
    {
        if (inline)
            buffer.concat(".isa.method_msgSend[\"initWithObjects:forKeys:\"] || _objj_forward)");
        else
            buffer.concat(".isa.objj_msgSend2");

        buffer.concat("(" + tempVar + ", \"initWithObjects:forKeys:\", [");

        for (let i = 0; i < numKeys; i++)
        {
            const value = values[i];

            if (i)
                buffer.concat(", ");

            compileNode(value, scope);
        }

        buffer.concat("], [");

        for (let i = 0; i < numKeys; i++)
        {
            const key = keys[i];

            if (i)
                buffer.concat(", ");

            compileNode(key, scope);
        }

        buffer.concat("]))");
    }

    scope.decrementReceiverLevel();
}

/*
    objj:

    local: boolean - Whether the import is local or system
    filename: Literal node - Path to the file to be imported
*/
function objjImportStatement(node, scope)
{
    return scope;

    /*
     const
         buffer = scope.compiler.jsBuffer,
         isLocal = node.objj.local,
         filename = node.objj.filename.value;
     */

    // Locate and import the given file
}

/*
    objj:

    name: Identifier node - Class name
    superclass: Identifier node - Superclass name
    category: Identifier node - Category name
    protocols: Array - Identifier nodes
    ivars: Array - ivar nodes
    body: Array - Statement nodes
*/
function objjClassDeclaration(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        objj = node.objj,
        className = objj.name.name;

    if (!compiler.isUniqueGlobalSymbol(node, scope, objj.name))
        return;

    // Use separate buffers for instance methods and class methods
    // so they can be grouped together in the generated code.
    compiler.imBuffer = new StringBuffer(compiler);
    compiler.cmBuffer = new StringBuffer(compiler);

    const
        result = compiler.declareClass(node),
        classDef = result.classDef,
        comment = result.comment,
        protocols = objj.protocols;

    if (protocols)
    {
        for (let i = 0; i < protocols.length; i++)
        {
            const
                varDecl = i === 0 ? "var " : "",
                declaration =
`${varDecl}$the_protocol = objj_getProtocol("${protocols[i].name}");

if (!$the_protocol)
→throw new ReferenceError("Cannot find protocol declaration for '${protocols[i].name}'");

class_addProtocol($the_class, $the_protocol);
`;

            buffer.concat(indentString(declaration));
        }
    }

    const classScope = new Scope(Scope.OBJJ_CLASS, scope);

    classScope.classDef = classDef;

    if (classDef.superclassDef)
    {
        compiler.currentSuperClass = `objj_getClass("${className}").super_class`;
        compiler.currentSuperMetaClass = `objj_getMetaClass("${className}").super_class`;
    }

    // We must make a new class object for our class definition if it isn't a category
    if (!objj.category)
        buffer.concat("objj_registerClassPair($the_class);");

    let haveAccessors = false;

    // Now we add all ivars
    if (objj.ivars && objj.ivars.length > 0)
        haveAccessors = compiler.addIvars(node, classDef);

    // We will store the classDef first after accessors are done so we don't get a duplicate class error
    compiler.addClassDef(className, classDef);

    const bodyNodes = objj.body;

    // Add methods and other statements
    for (const bodyNode of bodyNodes)
        compileNode(bodyNode, classScope);

    // Add instance methods
    const haveMethods = !compiler.imBuffer.isEmpty() || haveAccessors;

    if (haveMethods)
        buffer.concat(indentString("\n\n// Instance methods\nclass_addMethods($the_class,\n["));

    if (haveAccessors)
        compiler.generateAccessors(node, classDef);

    buffer.concatBuffer(compiler.imBuffer);

    if (haveMethods)
        buffer.concat(indentString("\n]);"));

    // Add class methods
    if (!compiler.cmBuffer.isEmpty())
    {
        buffer.concat(indentString("\n\n// Class methods\nclass_addMethods($the_class.isa,\n["));
        buffer.concatBuffer(compiler.cmBuffer);
        buffer.concat(indentString("\n]);"));
    }

    buffer.concat("\n// @end: " + comment);

    // If the class conforms to protocols check self all required methods are implemented
    if (protocols)
        compiler.checkProtocolConformance(node, classDef, protocols);

    delete compiler.currentSuperClass;
    delete compiler.currentSuperMetaClass;
}

/*
    objj

    name: identifier node
    protocols: array of identifier node
    optional: array of method declarations
    required: array of method declarations
*/
function objjProtocolDeclaration(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        objj = node.objj,
        protocolName = objj.name.name;

    if (!compiler.isUniqueGlobalSymbol(node, scope, objj.name))
        return;

    compiler.imBuffer = new StringBuffer(compiler);
    compiler.cmBuffer = new StringBuffer(compiler);

    const
        protocols = objj.protocols,
        protocolScope = new Scope(Scope.OBJJ_PROTOCOL, scope),
        inheritedProtocols = [],
        inheritedProtocolDeclarations = [];

    let inheritedProtocolList;

    if (protocols)
    {
        inheritedProtocolList = [];

        for (let i = 0; i < protocols.length; i++)
        {
            const
                protocol = protocols[i],
                inheritedProtocolName = protocol.name,
                inheritedProtocolDef = compiler.getProtocolDef(inheritedProtocolName);

            if (inheritedProtocolDef)
            {
                const
                    varDecl = i === 0 ? "\nvar " : "",
                    declaration =
`${varDecl}$the_inherited_protocol = objj_getProtocol("${inheritedProtocolName}");

if (!$the_inherited_protocol)
→throw new ReferenceError("Cannot find protocol declaration for '${inheritedProtocolName}'");

protocol_addProtocol($the_protocol, $the_inherited_protocol);
`;

                inheritedProtocolDeclarations.push(indentString(declaration));
                inheritedProtocols.push(inheritedProtocolDef);
                inheritedProtocolList.push(inheritedProtocolName);
            }
            else
                compiler.unknownProtocolException(protocol);
        }

        if (inheritedProtocolList.length > 0)
            inheritedProtocolList = ` <${inheritedProtocolList.join(", ")}>`;
        else
            inheritedProtocolList = "";
    }
    else
        inheritedProtocolList = "";

    const comment = "@protocol " + protocolName + inheritedProtocolList;

    buffer.concat(`// ${comment}\nvar $the_protocol = objj_allocateProtocol("${protocolName}");\n`);

    if (inheritedProtocolDeclarations.length > 0)
        buffer.concat(inheritedProtocolDeclarations.join("\n"));

    buffer.concat("\nobjj_registerProtocol($the_protocol);\n");

    const protocolDef = new ProtocolDef(node, protocolName, inheritedProtocols);

    compiler.addProtocolDef(protocolName, protocolDef);
    protocolScope.protocolDef = protocolDef;

    for (const type of ["required", "optional"])
    {
        const methods = objj[type];

        if (methods && methods.length > 0)
        {
            protocolScope[`${type}ProtocolMethods`] = true;

            for (const method of methods)
                compileNode(method, protocolScope);

            delete protocolScope[`${type}ProtocolMethods`];
        }
    }

    // Generate code for methods
    for (const methodBuffer of [compiler.imBuffer, compiler.cmBuffer])
    {
        if (!methodBuffer.isEmpty())
        {
            buffer.concat("\nprotocol_addMethodDescriptions($the_protocol,\n[");
            buffer.concatBuffer(methodBuffer);
            buffer.concat(`\n],\ntrue, ${methodBuffer === compiler.imBuffer});`);
        }
    }

    delete compiler.imBuffer;
    delete compiler.cmBuffer;

    buffer.concat("\n// @end: " + comment);
}

/*
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
function checkParameterTypes(
    compiler,
    node,
    nodeArguments,
    types,
    returnType,
    classOrProtocolDef,
    overriddenMethod,
    selector
)
{
    if (overriddenMethod && compiler.shouldWarnAbout("parameter-types"))
    {
        const declaredTypes = overriddenMethod.types;

        if (!declaredTypes)
            return;

        if (declaredTypes.length === 0)
            return;

        // First type is return type
        const declaredReturnType = declaredTypes[0];

        // Create warning if return types are not the same.
        // It is ok if superclass has 'id' and subclass has a class type.
        if (!compiler.options.ignoreWarnings &&
            declaredReturnType !== types[0] &&
            !(declaredReturnType === "id" && returnType && returnType.objj.isClass))
        {
            compiler.addWarning(
                returnType || node.objj.action || node.objj.selectors[0],
                "conflicting return type in declaration of '%s': '%s' vs '%s'",
                selector,
                declaredReturnType,
                types[0]
            );

            compiler.addNote(
                overriddenMethod.node.objj.returnType,
                "previous declaration is here"
            );
        }

        // Check the parameter types. The count of the two type arrays
        // should be the same as they have the same selector.
        for (let i = 1; i < declaredTypes.length; i++)
        {
            const
                parameterType = declaredTypes[i],
                nodeArgument = nodeArguments[i - 1];

            // It's okay if the superclass uses 'id' and a subclass uses a class type
            if (!compiler.options.ignoreWarnings &&
                parameterType !== types[i] &&
                !(parameterType === "id" && nodeArgument.type.objj.isClass))
            {
                compiler.addWarning(
                    nodeArgument.type || nodeArgument.id,
                    "conflicting parameter type in declaration of '%s': '%s' vs '%s'",
                    selector,
                    parameterType,
                    types[i]
                );

                const params = overriddenMethod.node.objj.params;

                compiler.addNote(
                    params[i - 1].type,
                    "previous declaration is here"
                );
            }
        }
    }

    if (compiler.shouldWarnAbout("unknown-types"))
    {
        if (returnType.objj.isClass)
            compiler.checkForUnknownType(returnType, returnType.objj.name, classOrProtocolDef);

        for (const argument of nodeArguments)
        {
            const type = argument.type;

            if (type.objj.isClass)
                compiler.checkForUnknownType(type, type.objj.name, classOrProtocolDef);
        }
    }
}

/*
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
function objjMethodDeclaration(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        saveJSBuffer = compiler.jsBuffer,
        methodScope = new Scope(Scope.OBJJ_METHOD, scope),
        objj = node.objj,
        isInstanceMethod = objj.methodType === "-",
        parameters = objj.params,
        returnType = objj.returnType,

        // Return type is 'id' by default except for action methods, then it's 'void'
        defaultReturnType = objj.action ? "void" : "id",
        types = [returnType ? returnType.objj.name : defaultReturnType],
        returnTypeProtocols = returnType ? returnType.objj.protocols : null;

    compiler.checkTypeProtocols(returnTypeProtocols);

    // Temporarily swap the compiler's main buffer for the method buffer
    // so the methods can be appended to the main buffer later.
    compiler.jsBuffer = isInstanceMethod ? compiler.imBuffer : compiler.cmBuffer;

    const selector = compiler.compileMethod(node, scope, methodScope, parameters, types, compileNode);

    // Restore the main buffer
    compiler.jsBuffer = saveJSBuffer;

    // Add the method to the class or protocol definition
    let def = scope.classDef,
        duplicate = null,
        method = null;

    if (def)
    {
        if (isInstanceMethod)
            duplicate = def.getOwnInstanceMethod(selector);
        else
            duplicate = def.getOwnClassMethod(selector);

        if (duplicate)
        {
            compiler.addError(node, "duplicate definition of method '%s'", selector);
            compiler.addNote(duplicate.node, "original definition is here:");
        }
    }
    else
    {
        def = scope.protocolDef;

        if (def)
        {
            if (isInstanceMethod)
                duplicate = def.getOwnInstanceMethod(selector);
            else
                duplicate = def.getOwnClassMethod(selector);

            if (duplicate && !compiler.options.ignoreWarnings)
            {
                compiler.addWarning(node, "duplicate declaration of method '%s' ignored", selector);
                compiler.addNote(duplicate.node, "first declaration is here:");
            }
        }
    }

    if (!duplicate)
    {
        // Look in all protocols and superclasses to ensure no type conflicts
        method = isInstanceMethod ? def.getInstanceMethod(selector) : def.getClassMethod(selector);
        checkParameterTypes(compiler, node, parameters, types, returnType, def, method, selector);

        const methodDef = new MethodDef(node, selector, types);

        if (isInstanceMethod)
            def.addInstanceMethod(methodDef, scope);
        else
            def.addClassMethod(methodDef, scope);
    }

    compiler.filterIdentifierIssues(methodScope);
}

/*
    objj:

    selectors: Array - Identifier nodes
    args: Array - ExpressionStatement nodes
    varArgs: Array - ExpressionStatement nodes following a comma
    receiver: ExpressionStatement | Super
*/
function objjMessageSendExpression(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        inline = compiler.options.inlineMsgSend,
        buffer = compiler.jsBuffer,
        objj = node.objj,
        receiver = objj.receiver,
        selectors = objj.selectors,
        firstSelector = selectors[0],
        args = objj.args,
        varArgs = objj.varArgs,
        isInstanceMethod = scope.currentObjjMethodType() === "-";

    // If this is an outer message send, insert a comment with the original code,
    // since the generated code is basically unreadable.
    if (!compiler.messageSend)
    {
        // Set a flag so that nested message sends won't generate a comment
        compiler.messageSend = true;
        buffer.concat(`/* ${compiler.source.substring(node.start, node.end)} */ `);
    }

    // There is always at least one selector
    let selector = firstSelector ? firstSelector.name : "",
        argCount;

    // Assemble the selector
    for (let i = 0; i < args.length; i++)
    {
        if (i === 0)
            selector += ":";
        else
            selector += (selectors[i] ? selectors[i].name : "") + ":";
    }

    if (!inline)
    {
        // Calculate the total number of arguments so we can choose appropriate msgSend function
        argCount = args.length;

        if (varArgs)
            argCount += varArgs.length;
    }

    let receiverMightBeNil = false,
        receiverIsIdentifier = false,
        receiverText;

    // We don't have to check for 'super' use outside of a method, that is done by acorn
    if (receiver.type === "Super")
    {
        const superclass = isInstanceMethod ? compiler.currentSuperClass : compiler.currentSuperMetaClass;

        // If there is no superclass, it's an error to use 'super'
        if (superclass)
        {
            if (inline)
                buffer.concat("(" + superclass + ".method_dtable[\"" + selector + "\"] || _objj_forward)(self");
            else
            {
                buffer.concat("objj_msgSendSuper");

                if (argCount < 4)
                    buffer.concat(argCount + "");

                buffer.concat("({ receiver: self, super_class: " + superclass + " }");
            }
        }
        else
        {
            compiler.addError(
                receiver,
                "'%s' class cannot use 'super' because it is a root class",
                scope.currentClassName()
            );
        }
    }
    else // self, ivar or expression
    {
        let receiverVar;

        if (receiver.type === "Identifier")
        {
            receiverVar = scope.getVar(receiver.name);

            const isIvar = !receiverVar &&
                isInstanceMethod &&
                compiler.getIvarForCurrentClass(receiver.name, scope) !== null;

            receiverIsIdentifier = !isIvar;
        }
        else
            receiverIsIdentifier = false;

        // If receiver is an identifier, mark it that so we know to look for
        // misspelled class/protocol names.
        if (receiver.type === "Identifier")
            scope.receiver = true;

        // Make a temp buffer to capture the output of compiling the receiver,
        // we need it more than once.
        compiler.jsBuffer = new StringBuffer(compiler);

        // If the receiver is not self or an ivar, we need to assign its value to a temporary variable
        if (receiverIsIdentifier)
        {
            if (receiver.name === "self")
            {
                /*
                    'self' is a special case. There are two possibilities:

                    - 'self' used outside of a method. In this case it can always be nil.
                    - 'self' used within a method. In this case it might be nil if it has been assigned to.
                */
                if (!receiverVar || receiverVar.type !== "self")
                    receiverMightBeNil = true;
                else
                    receiverMightBeNil = receiverVar.scope.assignmentToSelf;
            }
            else
                // If the receiver is not 'self', it might be nil if it is not a class
                receiverMightBeNil = !compiler.getClassDef(receiver.name);

            compileNode(receiver, scope);
            receiverText = compiler.jsBuffer.toString();

            if (receiverMightBeNil)
                buffer.concat(`(${receiverText} == null ? null : `);

            if (inline)
                buffer.concat("(");

            buffer.concat(receiverText);
        }
        else
        {
            receiverMightBeNil = true;
            scope.incrementReceiverLevel();

            const
                tempVar = StringBuffer.RECEIVER_TEMP_VAR + scope.receiverLevel,
                inlineParens = inline ? "(" : "";

            compileNode(receiver, scope);
            receiverText = compiler.jsBuffer.toString();

            buffer.concat(`((${tempVar} = ${receiverText}), ${tempVar} == null ? null : ${inlineParens}${tempVar}`);
        }

        // Done using the receiver temp buffer, restore the normal buffer
        compiler.jsBuffer = buffer;

        if (inline)
            buffer.concat(`.isa.method_msgSend["${selector}"] || _objj_forward)`);
        else
            buffer.concat(".isa.objj_msgSend");
    }

    if (receiver.type !== "Super")
    {
        if (!inline && argCount < 4)
            buffer.concat(argCount + "");

        if (receiverIsIdentifier)
            buffer.concat(`(${receiverText}`);
        else
            buffer.concat("(" + StringBuffer.RECEIVER_TEMP_VAR + scope.receiverLevel);
    }

    buffer.concat(`, "${selector}"`);

    if (args)
    {
        for (const arg of args)
        {
            buffer.concat(", ");
            compileNode(arg, scope);
        }

        if (varArgs)
        {
            for (const arg of varArgs)
            {
                buffer.concat(", ");
                compileNode(arg, scope);
            }
        }
    }

    if (receiver.type !== "Super")
    {
        if (receiverMightBeNil)
            buffer.concat(")");

        if (!receiverIsIdentifier)
            scope.decrementReceiverLevel();
    }

    buffer.concat(")");

    // Clear the flag
    delete compiler.messageSend;
}

/*
    objj:

    selector: string
*/
function objjSelectorLiteralExpression(node, scope)
{
    scope.compiler.jsBuffer.concat(`sel_getUid("${node.objj.selector}")`, node);
}

/*
    objj:

    protocol: id
*/
function objjProtocolLiteralExpression(node, scope)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        name = node.objj.protocol.name,
        protocol = compiler.getProtocolDef(name);

    if (protocol)
        buffer.concat(`objj_getProtocol("${name}")`, node);
    else
        compiler.unknownProtocolException(node.objj.protocol);
}

/*
    objj:

    ref: Identifier node - The referenced identifier
*/
function objjReference(node, scope)
{
    const
        buffer = scope.compiler.jsBuffer,
        name = node.objj.ref.name;

    buffer.concat(
        `/* @ref(${name}) */ ` +
        `function $at_ref(__value) { return arguments.length ? ${name} = __value : ${name}; }`,
        node
    );
}

/*
    objj:

    ref: Expression node - The reference to deref
*/
function objjDereference(node, scope, compileNode)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer;

    compiler.checkCanDereference(node.objj.ref);
    compileNode(node.objj.ref, scope);
    buffer.concat("()");
}

/*
    objj:

    ids - [Identifier nodes]
*/
function objjTypeStatement(node, scope, actionFunc, type)
{
    const
        compiler = scope.compiler,
        buffer = compiler.jsBuffer,
        ids = node.objj.ids;

    let comment = "",
        code = [];

    for (let i = 0; i < ids.length; i++)
    {
        const id = ids[i];

        if (compiler.isUniqueGlobalSymbol(node, scope, id))
        {
            if (i === 0)
                comment += `// @${type}`;
            else
                comment += ",";

            comment += ` ${id.name}`;

            const line = actionFunc(id, id.name);

            if (line)
                code.push(line);
        }
    }

    buffer.concat(comment);

    if (code.length)
        buffer.concat("\n" + code.join(";\n"));
}

function objjClassStatement(node, scope)
{
    const actionFunc = (id, name) =>
    {
        scope.compiler.addClassDef(name, scope.compiler.createClass(id, name));
    };

    objjTypeStatement(node, scope, actionFunc, "class");
}

function objjGlobalStatement(node, scope)
{
    const actionFunc = (id) =>
    {
        scope.rootScope().vars.set(id.name, { type: "@global", node: id });
    };

    objjTypeStatement(node, scope, actionFunc, "global");
}

function objjTypeDefStatement(node, scope)
{
    const actionFunc = (id, name) =>
    {
        scope.compiler.addTypeDef(new TypeDef(id, name));

        return `objj_registerTypeDef(objj_allocateTypeDef("${name}"))`;
    };

    objjTypeStatement(node, scope, actionFunc, "typedef");
}

const generators =
    {
        ArrayExpression: arrayExpression,
        AssignmentExpression: assignmentExpression,
        BinaryExpression: binaryOrLogicalExpression,
        BlockStatement: blockStatement,
        BreakStatement: breakStatement,
        CallExpression: callExpression,
        CaseStatement: caseStatement,
        ConditionalExpression: conditionalExpression,
        ContinueStatement: continueStatement,
        DebuggerStatement: debuggerStatement,
        DoWhileStatement: doWhileStatement,
        ElseIfStatement: elseIfStatement,
        ElseStatement: elseStatement,
        ExpressionStatement: expressionStatement,
        ForInStatement: forInStatement,
        ForStatement: forStatement,
        Function: functionNode,
        Identifier: identifierNode,
        IfStatement: ifStatement,
        LabeledStatement: labeledStatement,
        Lambda: lambda,
        Literal: literal,
        LogicalExpression: binaryOrLogicalExpression,
        MemberExpression: memberExpression,
        NewExpression: newExpression,
        ObjectExpression: objectExpression,
        Program: program,
        ReturnStatement: returnStatement,
        SequenceExpression: sequenceExpression,
        SwitchStatement: switchStatement,
        ThisExpression: thisExpression,
        ThrowStatement: throwStatement,
        TryStatement: tryStatement,
        UnaryExpression: unaryExpression,
        UpdateExpression: updateExpression,
        VariableDeclaration: variableDeclaration,
        WhileStatement: whileStatement,
        WithStatement: withStatement,

        objj_ArrayLiteral: objjArrayLiteral,
        objj_ClassDeclaration: objjClassDeclaration,
        objj_ClassStatement: objjClassStatement,
        objj_Dereference: objjDereference,
        objj_DictionaryLiteral: objjDictionaryLiteral,
        objj_GlobalStatement: objjGlobalStatement,
        objj_ImportStatement: objjImportStatement,
        objj_MessageSendExpression: objjMessageSendExpression,
        objj_MethodDeclaration: objjMethodDeclaration,
        objj_ProtocolDeclaration: objjProtocolDeclaration,
        objj_ProtocolLiteralExpression: objjProtocolLiteralExpression,
        objj_Reference: objjReference,
        objj_SelectorLiteralExpression: objjSelectorLiteralExpression,
        objj_TypeDefStatement: objjTypeDefStatement
    };

module.exports = walk.make(generators);
