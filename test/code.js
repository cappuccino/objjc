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
        const
            filePath = `test/fixtures/${prefix}/src`,
            files = fs.readdirSync(filePath);

        for (let file of files)
        {
            const st = fs.statSync(`${filePath}/${file}`);

            if (st.isFile())
                makeTest(prefix, file);
        }

        if (prefix.includes("objj-nodes"))
            testImports();
    });
}

function testImports()
{
    const
        baseDir = "objj-nodes",
        srcDir = `${baseDir}/src/import-statement`,
        destDir = `${baseDir}/dest/import-statement`,
        fileInfo = [
            ["import-local", "@import \"foo.j\" should import the global symbols from 'foo.j'"],
            ["import-chain", "Imported files may themselves import other files"],
            ["foo/import-relative", "Local imports paths are relative to the file in which @import appears"],
            ["import-cache", "Only the first import of a file parses its symbols, subsequent imports are ignored"]
        ];

    context("import-statement", () =>
    {
        for (const info of fileInfo)
        {
            const
                filename = info[0],
                description = info[1];

            specify(description, () =>
            {
                const code = utils.compiledFixture(`${srcDir}/${filename}.j`).code;

                expect(code).to.equal(utils.readFixture(`${destDir}/${filename}.js`));
            });
        }
    });
}

context("Code generation", () =>
{
    makeContext("Javascript nodes", "js-nodes");
    makeContext("Objective-J nodes", "objj-nodes");
});
