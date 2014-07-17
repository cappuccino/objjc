/*
 * reporter.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var util = require("util");


var Reporter = function()
{
};

Reporter.prototype.report = function(issues)
{
    if (issues.length > 0)
    {
        // TODO: deal with acorn errors
        var warningCount = 0,
            errorCount = 0;

        for (var i = 0; i < issues.length; i++)
        {
            var issue = issues[i];

            if (issue.isWarning())
                ++warningCount;
            else if (issue.isError())
                ++errorCount;

            console.log(issue.getMessage());
        }

        var summary = "";

        if (warningCount > 0)
            summary = util.format("%d warning%s", warningCount, warningCount === 1 ? "" : "s");

        if (errorCount > 0)
        {
            if (summary)
                summary += " and ";

            summary += util.format("%d error%s", errorCount, errorCount === 1 ? "" : "s");
        }

        console.log(summary + " generated");
    }
    else
        console.log("objjc: no warnings or errors generated.");
};

module.exports = Reporter;
