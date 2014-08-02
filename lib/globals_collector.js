/*
 * globals_collector.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

module.exports = walk.make({  // jshint ignore:line

AssignmentExpression: function(node, scope, compileNode)
{
    var compiler = scope.compiler,
        target = node.left;

    if (target.type !== "Dereference")
    {
        if (scope.isRootScope() && target.type === "Identifier" && !scope.getVar(target.name))
            compiler.addGlobal(target);
    }
},

});
