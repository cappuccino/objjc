"use strict";

const issueHandler = require("acorn-issue-handler");

class CompileAbortedError extends Error {}

class TooManyErrors extends CompileAbortedError
{
    constructor(maxErrors)
    {
        super(`too many errors (>${maxErrors})`);
    }
}

class FilterableWarning extends issueHandler.Warning
{
    constructor(source, file, location, message)
    {
        super(source, file, location, message);
        this.filterable = true;
    }
}

class ImplicitGlobalWarning extends FilterableWarning
{
    static identifierIsValidInScope(identifier, scope)
    {
        const scopeVar = scope.getLocalVar(identifier);

        return scopeVar && !scopeVar.implicit;
    }

    isValidInScope(scope)
    {
        return this.constructor.identifierIsValidInScope(this.node.name, scope);
    }
}

class ImplicitGlobalNote extends issueHandler.Note
{
    constructor(source, file, location, message)
    {
        super(source, file, location, message);
        this.filterable = true;
    }

    isValidInScope(scope)
    {
        return ImplicitGlobalWarning.identifierIsValidInScope(this.node.name, scope);
    }
}

class UnknownIdentifierWarning extends FilterableWarning
{
    isValidInScope(scope)
    {
        const identifier = this.node.name;

        return (
            scope.getLocalVar(identifier) ||
            scope.getGlobalVar(identifier) ||
            scope.compiler.getClassDef(identifier)
        );
    }
}

class GlobalIdentifierNote extends issueHandler.Note {}

exports.CompileAbortedError = CompileAbortedError;
exports.TooManyErrors = TooManyErrors;
exports.ImplicitGlobalWarning = ImplicitGlobalWarning;
exports.ImplicitGlobalNote = ImplicitGlobalNote;
exports.UnknownIdentifierWarning = UnknownIdentifierWarning;
exports.GlobalIdentifierNote = GlobalIdentifierNote;
