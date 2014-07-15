/*
 * exceptions.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var acorn = require("objj-acorn/acorn"),
    chalk = require("chalk");

function initClass(klass, name, superclass)
{
    klass.prototype = Object.create(superclass.prototype);
    klass.prototype.constructor = klass;
    klass.prototype.name = name;
    exports[name] = klass;
}

var CompilerError = function(compiler, node, message)
{
    this.init(compiler, node, message);
};

initClass(CompilerError, "CompilerError", Error);

CompilerError.prototype.init = function(compiler, node, message)
{
    this.compiler = compiler;
    this.node = node;
    this.message = message || "";
};

CompilerError.prototype.formatMessage = function()
{
    var source = this.compiler.source,
        context = acorn.getLineInfo(source, this.node.start),
        line = source.substring(context.lineStart, context.lineEnd),
        message = "\n" + line;

    message += " ".repeat(context.column);
    message += "^".repeat(Math.min(1, line.length)) + "\n";
    message += chalk[this.name.endsWith("Error") ? "red" : "purple"](this.type + ":") + " line " + context.line + " in " + this.compiler.URL + ": " + this.message;

    return message;
};

var DuplicateClassError = function(compiler, node, message)
{
    this.init(compiler, node, message);
};

initClass(DuplicateClassError, "DuplicateClassError", CompilerError);

var UndefinedSuperclassError = function(compiler, node)
{
    var className = node.class.className,
        superclassName = node.superclassname.name,
        message = util.format("cannot find implementation declaration for '%s', superclass of '%s'", className, superclassName);

    /*
    for (var i = Compiler.importStack.length; i >= 0; i--)
        errorMessage += util.format(
            "\n%sImported by: %s",
            " ".repeat((Compiler.importStack.length - i) * 2),
            Compiler.importStack[i]
        );
    */

    this.init(compiler, node, message);
};

initClass(UndefinedSuperclassError, "UndefinedSuperclassError", CompilerError);
