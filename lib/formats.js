"use strict";

const
    fs = require("fs"),
    path = require("path"),
    Scope = require("./scope");

// Map between AST node types and format node types
const typeMap = { // jscs: ignore requireMultipleVarDecl
    "*": "*", // Global properties
    ArrayExpression: "array",
    AssignmentExpression: "assignment",
    BinaryExpression: "binary expression",
    BlockStatement: "{}",
    BreakStatement: "break",
    CallExpression: "function call",
    CaseStatement: "case",
    ConditionalExpression: "?:",
    ContinueStatement: "continue",
    DebuggerStatement: "debugger",
    DoWhileStatement: "do while",
    ElseIfStatement: "else if",
    ElseStatement: "else",
    EmptyStatement: "empty statement",
    ExpressionStatement: "expression statement",
    ForInStatement: "for in",
    ForStatement: "for",
    FunctionDeclaration: "function",
    FunctionExpression: "function expression",
    Identifier: "identifier",
    IfStatement: "if",
    LabeledStatement: "label",
    Lambda: "lambda",
    Literal: "literal",
    LogicalExpression: "logical expression",
    MemberExpression: "member",
    NewExpression: "new",
    ObjectExpression: "object",
    Program: "program",
    ReturnStatement: "return",
    SequenceExpression: ",",
    Statement: "statement",
    SwitchStatement: "switch",
    ThisExpression: "this",
    ThrowStatement: "throw",
    TryStatement: "try",
    UnaryExpression: "unary expression",
    UpdateExpression: "update expression",
    VariableDeclaration: "var",
    WhileStatement: "while",
    WithStatement: "with",

    objj_ClassDeclaration: "@implementation",
    objj_ClassStatement: "@class",
    objj_Dereference: "@deref",
    objj_DictionaryLiteral: "@{}",
    objj_GlobalStatement: "@global",
    objj_ImportStatement: "@import",
    objj_IvarDeclaration: "ivar",
    objj_MessageSendExpression: "message",
    objj_MethodDeclaration: "method",
    objj_ObjectiveJType: "objective-j type",
    objj_ProtocolDeclaration: "@protocol",
    objj_ProtocolLiteralExpression: "@protocol()",
    objj_Reference: "@ref",
    objj_TypeDefStatement: "@typedef",
    objj_SelectorLiteralExpression: "@selector"
};

function availableFormats()
{
    // Be nice and show what formats *are* available
    const
        formatsPath = path.join(__dirname, "..", "formats"),
        formats = fs.readdirSync(formatsPath);

    return formats.filter(filename => path.extname(filename) === ".json")
                  .map(filename => path.basename(filename, path.extname(filename)));
}

/*
    Convert a raw JSON format into a Format object.
*/
class Format
{
    constructor(format)
    {
        // The format data, a hash of node names and format specs
        this.data = Object.create(null);

        // A map between meta node names (e.g. "*block")
        // and a hash of the node names they represent.
        this.metaMap = Object.create(null);

        // Global properties
        this.globals = Object.create(null);

        if (format)
            this.render(format);
    }

    /*
        To avoid extra lookups for meta nodes, we render the meta
        nodes into real nodes.
    */
    render(format)
    {
        // Render meta nodes
        for (const key in format)
        {
            const currentNode = format[key];

            if (key === "*")
            {
                this.cloneNode(currentNode, "*");
                this.globals = this.data["*"];
                continue;
            }
            else if (!format.hasOwnProperty(key))
                continue;

            if (key.charAt(0) === "*" && key.length > 1)
            {
                const nodes = currentNode.nodes || [];

                // Remove nodes array so we can clone the rest of the properties
                delete currentNode.nodes;

                for (const name of nodes)
                {
                    this.cloneNode(currentNode, name);
                    this.metaMap[name] = key;
                }
            }
            else
            {
                this.cloneNode(currentNode, key);
            }
        }
    }

    /*
        If no data node with the given name exists, create it and copy node.
        Otherwise merge node with the existing data node.
    */
    cloneNode(node, name)
    {
        const
            target = this.data[name] || Object.create(null),
            keys = Object.keys(node);

        for (const key of keys)
        {
            target[key] = node[key];

            if (["before", "after"].indexOf(key) >= 0 && typeof target[key] === "string")
                target[key] = { "*": target[key] };
        }

        this.data[name] = target;
    }

    valueForProperty(node, type, selector)
    {
        // Map from AST node types to node item types
        const nodeItemType = typeMap[type];

        if (nodeItemType)
        {
            const nodeItem = this.data[nodeItemType];

            if (nodeItem)
            {
                let value = nodeItem[selector];

                if (typeof value === "object")
                    value = this.lookupValue(node, value);

                if (value !== undefined)
                    return value;
            }

            return this.globals[selector];
        }

        return null;
    }

    getGlobal(property)
    {
        return this.valueForProperty(null, "*", property);
    }

    /*
        There are several special keys possible in selectorObject:

            "$previous" - selects the previous statement node
            "$parent" - selects the parent node
            "null" - used if there is no previous statement or parent node
            "*" - fallback if nothing matches
    */
    lookupValue(node, selectorObject)
    {
        let value,
            fallbackValue,
            type,
            mappedType,
            parentIndex = 0;

        while (true)
        {
            // If we have a specific type we are looking for,
            // see if an item with that type exists.
            if (type)
            {
                mappedType = typeMap[type];

                // If it's a bogus type, bail
                if (!mappedType)
                    return null;
            }

            if (mappedType)
            {
                value = selectorObject[mappedType];

                if (typeof value === "object")
                {
                    // If the value is an object, go around again
                    // with that object as the selector object.
                    type = null;
                    selectorObject = value;
                    continue;
                }
                else if (typeof value === "string")
                {
                    // If the value is a string, return it.
                    return value;
                }

                // If there is no matching value, try a metatype.
                // If there is a metatype, go around again with that type.
                const metaType = this.metaMap[mappedType];

                if (metaType)
                {
                    mappedType = metaType;
                    type = null;
                    continue;
                }
            }

            // As we descend into nested selector objects,
            // save the most recent fallback item we find.
            const currentFallback = selectorObject["*"];

            if (currentFallback !== undefined)
                fallbackValue = currentFallback;

            // Try $previous first
            value = selectorObject.$previous;

            if (value)
            {
                type = Scope.previousStatementType(node);
            }
            else
            {
                // If $previous fails, try $parent
                value = selectorObject.$parent;

                if (value)
                {
                    type = Scope.parentNodeType(node, parentIndex);
                    ++parentIndex;
                }
            }

            // If we have $parent or $previous and its value is an object,
            // go around again with that value as the selector object.
            // If we have a string, return it.
            if (typeof value === "object")
            {
                // If there is no previous or parent item, use "null" as the mapped type.
                if (type)
                    mappedType = null;
                else
                {
                    mappedType = "null";
                    type = null;
                }

                selectorObject = value;
                continue;
            }
            else if (typeof value === "string")
            {
                return value;
            }
            else if (value === undefined)
            {
                if (typeof fallbackValue === "object")
                {
                    selectorObject = fallbackValue;
                    continue;
                }
            }

            break;
        }

        // At this point, we have tried everything. If it failed, try the fallback.
        if (value === undefined)
            value = fallbackValue;

        return value;
    }
}

/*
    Load the format at the given path. If the path contains a directory
    separator, the file at the given path is loaded. Otherwise the named
    format is loaded from the formats directory. In either case, if the
    load is successful, the format specification object is returned.
    If there are errors, an Error is thrown.
*/
exports.load = function(formatPath)
{
    let filePath = formatPath,
        isStandardFormat,
        error;

    formatPath = null;

    if (filePath.includes(path.sep))
    {
        // Load a user-supplied format
        filePath = path.resolve(filePath);
        formatPath = filePath;
        isStandardFormat = false;
    }
    else
    {
        // Load a standard format
        if (path.extname(filePath) === ".json")
            filePath = path.basename(filePath, ".json");

        formatPath = path.resolve(path.join(__dirname, "..", "formats", filePath + ".json"));
        isStandardFormat = true;
    }

    let format = null;

    try
    {
        const json = fs.readFileSync(formatPath, { encoding: "utf8" });

        format = new Format(JSON.parse(json));
    }
    catch (e)
    {
        if (e.code === "ENOENT")
        {
            error = "no such format '" + filePath + "'\n";

            if (isStandardFormat)
                error += "Available formats: " + availableFormats().join(", ");
        }
        else if (e instanceof SyntaxError)
        {
            error = "invalid JSON in format file '" + formatPath + "'\n" + e.message;
        }
        else
        {
            error = "could not read format file '" + e.message + "'";
        }

        throw new Error(error);
    }

    return format;
};
