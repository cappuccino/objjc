"use strict";

const
    expect = require("code").expect,
    fs = require("fs"),
    path = require("path"),
    rimraf = require("rimraf"),
    utils = require("./lib/utils.js");

/* eslint-disable max-len, max-nested-callbacks */

const dir = "test/fixtures/cli/"; // jscs: ignore requireMultipleVarDecl

function compareWithFixture(filePath, exitCode)
{
    // If the source is in /code/, ".txt" maps to ".txt" in dest, everything else to ".js".
    // Otherwise everything maps to ".txt".
    const parsedPath = path.parse(`cli/${filePath.replace("/src/", "/dest/")}`);

    let result;

    if (filePath.startsWith("misc"))
        result = utils.compiledMiscCliFixture(parsedPath.name, true);
    else
        result = utils.compiledCliFixture(dir + filePath);

    let destExtension;

    if (filePath.startsWith("code"))
        destExtension = parsedPath.ext === ".txt" ? ".txt" : ".js";
    else
        destExtension = ".txt";

    parsedPath.base = parsedPath.name + destExtension;
    expect(result.output).to.equal(utils.readFixture(path.format(parsedPath)));

    if (exitCode)
        expect(result.exitCode).to.equal(exitCode);
}

describe("cli", () =>
{
    describe("code", () =>
    {
        it("--allow-hash-bang should be passed through to acorn-objj", () =>
        {
            compareWithFixture("code/src/allow-hash-bang.js");
        });

        it("browser globals should be recognized with '--environment browser'", () =>
        {
            compareWithFixture("code/src/environment-browser.js");
        });

        it("node globals should be recognized with '--environment node'", () =>
        {
            compareWithFixture("code/src/environment-node.js");
        });

        it("a named format should be used with '--format name'", () =>
        {
            compareWithFixture("code/src/format-name.js");
        });

        it("inline message sends should be generated with '--inline-msg-send'", () =>
        {
            compareWithFixture("code/src/inline-msg-send.j");
        });

        it("no method function names should be generated with '--no-method-names'", () =>
        {
            compareWithFixture("code/src/no-method-names.j");
        });

        it("no method type signatures should be generated with '--no-type-signatures'", () =>
        {
            compareWithFixture("code/src/no-type-signatures.j");
        });

        it("function declarations should not be transformed into function expressions with '--objj-scope false'", () =>
        {
            compareWithFixture("code/src/objj-scope.j");
        });

        it("only a source map should be generated with '--source-map-only'", () =>
        {
            compareWithFixture("code/src/source-map-only.txt");
        });

        it("code and source map should be generated with '--source-map'", () =>
        {
            compareWithFixture("code/src/source-map.txt");
        });

        it("--output should cause generated code & source map to go into the given directory", done =>
        {
            const result = utils.run(["--output", "test_out", "--source-map", "test/fixtures/cli/code/src/source-map.txt"]);

            expect(result.exitCode).to.equal(0);

            let stats = fs.statSync("test_out"),
                outputDirectoryExists = stats.isDirectory();

            try
            {
                expect(outputDirectoryExists).to.be.true();
                stats = fs.statSync("test_out/source-map.js");
                expect(stats.isFile()).to.be.true();
                stats = fs.statSync("test_out/source-map.js.map");
                expect(stats.isFile()).to.be.true();
            }
            finally
            {
                rimraf("test_out", {}, () => done());
            }
        });
    });

    describe("exceptions", () =>
    {
        it("an error should be generated if an unknown format is used with --format", () =>
        {
            compareWithFixture("exceptions/src/format-bad.js", 2);
        });

        it("all warnings should be ignored with --ignore-warnings", () =>
        {
            compareWithFixture("exceptions/src/ignore-warnings.j", 2);
        });

        it("an unlimited number of errors should be allowed with '--max-errors 0'", () =>
        {
            compareWithFixture("exceptions/src/max-errors-0.j", 2);
        });

        it("compilation should be stopped if the number of errors exceeds 1 with '--max-errors 1'", () =>
        {
            compareWithFixture("exceptions/src/max-errors-1.j", 2);
        });

        it("--module should be passed through to acorn-objj and thus generate strict errors", () =>
        {
            compareWithFixture("exceptions/src/module.js", 2);
        });

        it("--strict-semicolons should be passed through to acorn-objj and thus generate missing semicolon errors", () =>
        {
            compareWithFixture("exceptions/src/strict-semicolons.js", 2);
        });

        it("no code should be generated but warnings/errors should still be shown with --quiet", () =>
        {
            compareWithFixture("exceptions/src/quiet.j", 1);
        });

        it("no output should be generated but a non-zero exit code should be returned with --silent", () =>
        {
            const result = utils.run(["--silent", dir + "exceptions/src/ignore-warnings.j"]);

            expect(result.output).to.be.empty();
            expect(result.exitCode).to.equal(2);
        });

        it("all optional warnings should be generated with '--warnings all'", () =>
        {
            compareWithFixture("exceptions/src/warnings-all.j", 1);
        });

        it("specific optional warnings should be enabled/disabled with '--warnings +parameter-types,no-implicit-globals'", () =>
        {
            compareWithFixture("exceptions/src/warnings-enable-disable.j", 1);
        });

        it("only the listed optional warnings should be generated with '--warnings debugger,unknown-types'", () =>
        {
            compareWithFixture("exceptions/src/warnings-list.j", 1);
        });

        it("enabled/disabled optional warnings mixed with a list should complain, e.g. '--warnings debugger,+shadowed-vars'", () =>
        {
            compareWithFixture("exceptions/src/warnings-mixed.j", 1);
        });

        it("an unknown optional warning should complain, e.g. '--warnings debugger,shadowed-var'", () =>
        {
            compareWithFixture("exceptions/src/warnings-unknown.j", 1);
        });

        it("no optional warnings should be generated with '--warnings none'", () =>
        {
            compareWithFixture("exceptions/src/warnings-none.j", 1);
        });
    });

    describe("miscellaneous", () =>
    {
        it("--environment with an unknown name should complain", () =>
        {
            const result = utils.run(["--environment", "foo", "foo"]);

            expect(result.output).to.match(/error: environment must be /);
        });

        it("--list-formats should display a list of available formats", () =>
        {
            compareWithFixture("misc/list-formats.txt");
        });

        it("--list-optional-warnings should display a list of optional warnings, indicating which are enabled by default", () =>
        {
            compareWithFixture("misc/list-optional-warnings.txt");
        });

        it("--source-map along with stdin should complain", () =>
        {
            let result = utils.run(["--source-map", "-"]);

            expect(result.output).to.match(/error: --source-map and --source-map-only may not be used with stdin/);
        });

        it("--source-map-only along with stdin should complain", () =>
        {
            let result = utils.run(["--source-map-only", "-"]);

            expect(result.output).to.match(/error: --source-map and --source-map-only may not be used with stdin/);
        });

        it("--version should display the objjc, acorn-objj and acorn versions ", () =>
        {
            const result = utils.run(["--version"]);

            expect(result.output).to.match(/^objjc v\d+\.\d+\.\d+ \(acorn-objj v\d+\.\d+\.\d+\, acorn v\d+\.\d+\.\d+\)/);
        });
    });
});
