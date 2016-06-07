"use strict";

const
    expect = require("code").expect,
    fs = require("fs"),
    path = require("path"),
    utils = require("./lib/utils.js");

function makeTest(prefix, file, destExtension, options)
{
    const
        srcName = path.basename(file),
        baseName = path.basename(file, path.extname(file)),
        fixture = `${prefix}/src/${srcName}`,
        dest = `${prefix}/dest/${baseName}${destExtension}`;

    specify(baseName.replace(/-/g, " "), () =>
    {
        const
            baseOptions = {
                ignoreWarnings: !prefix.startsWith("warnings"),
            },
            compileOptions = Object.assign({}, baseOptions, utils.setCompilerOptions(options, srcName)),
            code = utils.compiledFixture(fixture, compileOptions).code;

        expect(code).to.equal(utils.readFixture(dest));
    });
}

function makeDescribe(title, prefix, destExtension, options)
{
    context(title, () =>
    {
        const files = fs.readdirSync(`test/fixtures/${prefix}/src`);

        for (let file of files)
            makeTest(prefix, file, destExtension, options);
    });
}

context("Code generation", () =>
{
    makeDescribe("Javascript nodes", "js-nodes", ".js");
    makeDescribe("Objective-J nodes", "objj-nodes", ".js");
});
