"use strict";

const
    expect = require("code").expect,
    fs = require("fs"),
    path = require("path"),
    utils = require("./lib/utils.js");

function makeTest(prefix, file)
{
    const
        srcName = path.basename(file),
        baseName = path.basename(file, path.extname(file)),
        fixture = `${prefix}/src/${srcName}`,
        dest = `${prefix}/dest/${baseName}.js`;

    specify(baseName.replace(/-/g, " "), () =>
    {
        const
            baseOptions = {
                ignoreWarnings: !prefix.startsWith("warnings")
            },
            compileOptions = Object.assign({}, baseOptions, utils.setCompilerOptions({}, srcName)),
            code = utils.compiledFixture(fixture, compileOptions).code;

        expect(code).to.equal(utils.readFixture(dest));
    });
}

function makeContext(title, prefix)
{
    context(title, () =>
    {
        const files = fs.readdirSync(`test/fixtures/${prefix}/src`);

        for (let file of files)
        {
            const st = fs.statSync(filePath);

            if (st.isFile())
                makeTest(prefix, file);
        }
    });
}

context("Code generation", () =>
{
    makeContext("Javascript nodes", "js-nodes");
    makeContext("Objective-J nodes", "objj-nodes");
});
