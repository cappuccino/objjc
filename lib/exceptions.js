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

class InternalError extends CompileAbortedError
{
    constructor()
    {
        super("an internal error ocurred");
    }
}

class ImplicitGlobalWarning extends issueHandler.Warning
{
    identifierIsValidInScope(scope)
    {
        const scopeVar = scope.getLocalVar(this.node.name);

        return scopeVar && !scopeVar.implicit;
    }
}

class UnknownIdentifierWarning extends issueHandler.Warning
{
    identifierIsValidInScope(scope)
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
exports.InternalError = InternalError;
exports.ImplicitGlobalWarning = ImplicitGlobalWarning;
exports.UnknownIdentifierWarning = UnknownIdentifierWarning;
exports.GlobalIdentifierNote = GlobalIdentifierNote;
