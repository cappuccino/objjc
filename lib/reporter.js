"use strict";

const
    issueHandler = require("acorn-issue-handler"),
    utils = require("./utils.js");

class ObjjcReporter extends issueHandler.reporters.ConsoleReporter
{
    constructor(options)
    {
        super(options);
        this.lastIssue = null;
    }

    renderIssue(issue)
    {
        const file = issue.file;
        let importStack = "";

        if ((this.lastIssue === null || this.lastIssue.file !== issue.file) && issue.importStack)
            importStack = issue.importStack;

        this.lastIssue = issue;
        issue.file = utils.getRelativeSourcePath(file);

        const result = importStack + super.renderIssue(issue);

        issue.file = file;

        return result;
    }
}

module.exports = ObjjcReporter;
