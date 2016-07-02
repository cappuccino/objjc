"use strict";

const
    expect = require("code").expect,
    fs = require("fs"),
    path = require("path"),
    pathExists = require("path-exists").sync,
    rimraf = require("rimraf").sync,
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

function testOutputOption(sourcePath, outputPath, extraArgs, expectedOutput, options)
{
    const args = ["--output", outputPath];

    if (extraArgs)
        args.push(...extraArgs);

    args.push(sourcePath);

    const result = utils.run(args, options);

    expect(result.exitCode).to.equal(0);

    let dirExists = pathExists("test_out");

    if (dirExists)
        dirExists = fs.statSync("test_out").isDirectory();

    expect(dirExists).to.be.true();

    if (dirExists)
    {
        for (const file of expectedOutput)
        {
            const
                filePath = path.join("test_out", file),
                isFile = pathExists(filePath) && fs.statSync(filePath).isFile();

            expect(isFile).to.be.true();
        }
    }

    rimraf("test_out", {});
}

context("CLI", () =>
{
    context("acorn options", () =>
    {
        specify("--allow-hash-bang should be passed through to acorn-objj", () =>
        {
            compareWithFixture("code/src/allow-hash-bang.js");
        });

        specify("--module should be passed through to acorn-objj and thus generate strict errors", () =>
        {
            compareWithFixture("exceptions/src/module.js", 2);
        });

        specify("--strict-semicolons should be passed through to acorn-objj and thus generate missing semicolon errors", () =>
        {
            compareWithFixture("exceptions/src/strict-semicolons.js", 2);
        });
    });

    context("Compiler options", () =>
    {
        context("--environment", () =>
        {
            specify("browser globals should be recognized with '--environment browser'", () =>
            {
                compareWithFixture("code/src/environment-browser.js");
            });

            specify("node globals should be recognized with '--environment node'", () =>
            {
                compareWithFixture("code/src/environment-node.js");
            });

            specify("--environment with an unknown name should complain", () =>
            {
                const result = utils.run(["--environment", "foo", "foo"]);

                expect(result.output).to.match(/^objjc: error: environment must be /);
            });
        });

        context("--ignore-warnings", () =>
        {
            specify("all warnings should be ignored with --ignore-warnings", () =>
            {
                compareWithFixture("exceptions/src/ignore-warnings.j", 2);
            });
        });

        context("--inline-msg-send", () =>
        {
            specify("inline message sends should be generated with '--inline-msg-send'", () =>
            {
                compareWithFixture("code/src/inline-msg-send.j");
            });
        });

        context("--max-errors", () =>
        {
            specify("an unlimited number of errors should be allowed with '--max-errors 0'", () =>
            {
                compareWithFixture("exceptions/src/max-errors-0.j", 2);
            });

            specify("compilation should be stopped if the number of errors exceeds 1 with '--max-errors 1'", () =>
            {
                compareWithFixture("exceptions/src/max-errors-1.j", 2);
            });
        });

        context("--warnings", () =>
        {
            specify("all optional warnings should be generated with '--warnings all'", () =>
            {
                compareWithFixture("exceptions/src/warnings-all.j", 1);
            });

            specify("specific optional warnings should be enabled/disabled with '--warnings +parameter-types,no-implicit-globals'", () =>
            {
                compareWithFixture("exceptions/src/warnings-enable-disable.j", 1);
            });

            specify("only the listed optional warnings should be generated with '--warnings debugger,unknown-types'", () =>
            {
                compareWithFixture("exceptions/src/warnings-list.j", 1);
            });

            specify("enabled/disabled optional warnings mixed with a list should complain, e.g. '--warnings debugger,+shadowed-vars'", () =>
            {
                const mixedWarning = /^objjc: warning: listing specific compiler warnings may not be mixed with inclusive\/exclusive warnings/;

                let result = utils.run([
                    "--warnings",
                    "debugger,+shadowed-vars",
                    dir + "exceptions/src/warnings-all.j"
                ]);

                expect(result.output).to.match(mixedWarning);

                result = utils.run([
                    "--warnings",
                    "debugger,no-shadowed-vars",
                    dir + "exceptions/src/warnings-all.j"
                ]);

                expect(result.output).to.match(mixedWarning);

                result = utils.run([
                    "--warnings",
                    "no-shadowed-vars, debugger",
                    dir + "exceptions/src/warnings-all.j"
                ]);

                expect(result.output).to.match(mixedWarning);
            });

            specify("an unknown optional warning should complain, e.g. '--warnings debugger,shadowed-var'", () =>
            {
                const result = utils.run(["--warnings", "debugger,shadowed-var", dir + "exceptions/src/warnings-all.j"]);

                expect(result.output).to.match(/^objjc: warning: unknown compiler warning 'shadowed-var'/);
            });

            specify("no optional warnings should be generated with '--warnings none'", () =>
            {
                compareWithFixture("exceptions/src/warnings-none.j", 1);
            });
        });
    });

    context("Code generation options", () =>
    {
        context("--ast", () =>
        {
            specify("'--ast 0' should output a compressed AST", () =>
            {
                compareWithFixture("code/src/ast-0.txt");
            });

            specify("'--ast 2' should output a formatted AST", () =>
            {
                compareWithFixture("code/src/ast-2.txt");
            });

            specify("--ast with --quiet should output nothing", () =>
            {
                const result = utils.run(["--ast", "2", "--quiet", dir + "code/src/ast-2.txt"]);

                expect(result.output).to.be.empty();
            });
        });

        context("--format", () =>
        {
            specify("a named format should be used with '--format name'", () =>
            {
                compareWithFixture("code/src/format-name.js");
            });

            specify("a named format should be used given '--format name.json'", () =>
            {
                compareWithFixture("code/src/format-name.json.js");
            });

            specify("the format at a path should be used given '--format path/to/format.json'", () =>
            {
                compareWithFixture("code/src/format-path.js");
            });

            specify("an error should be generated if --format is given an unknown standard format name", () =>
            {
                const result = utils.run(["--format", "foo", dir + "code/src/format-name.js"]);

                expect(result.output).to.match(/^objjc: error: no such format 'foo'\nAvailable formats: /);
                expect(result.exitCode).to.equal(2);
            });

            specify("an error should be generated if --format is given a path to a non-existent format", () =>
            {
                const result = utils.run(["--format", "foo/bar.json", dir + "code/src/format-name.js"]);

                expect(result.output).to.match(/^objjc: error: no such format '.+?foo[/\\]bar\.json'/);
                expect(result.exitCode).to.equal(2);
            });

            specify("an error should be generated if a format has invalid JSON", () =>
            {
                const result = utils.run(["--format", dir + "exceptions/src/format-invalid.json", dir + "code/src/format-name.js"]);

                expect(result.output).to.match(/^objjc: error: invalid JSON in format file '.+?'/);
                expect(result.exitCode).to.equal(2);
            });
        });

        context("--method-names", () =>
        {
            specify("no method function names should be generated with '--no-method-names'", () =>
            {
                compareWithFixture("code/src/no-method-names.j");
            });
        });

        context("--objj-scope", () =>
        {
            specify("function declarations should not be transformed into function expressions with '--objj-scope false'", () =>
            {
                compareWithFixture("code/src/objj-scope.j");
            });
        });

        context("--output", () =>
        {
            specify("--output should cause generated code & source map to go into the given directory", () =>
            {
                testOutputOption(dir + "code/src/source-map.txt", "test_out", ["--source-map"], ["source-map.js", "source-map.js.map"]);
            });

            specify("should save generated code at the given path when using stdin with --output", () =>
            {
                testOutputOption("-", path.join("test_out", "bar.js"), null, ["bar.js"], { stdin: "var x = 7;" });
            });
        });

        context("--quiet", () =>
        {
            specify("no code should be generated but warnings/errors should still be shown with --quiet", () =>
            {
                compareWithFixture("exceptions/src/quiet.j", 1);
            });
        });

        context("--silent", () =>
        {
            specify("no output should be generated with --silent", () =>
            {
                const result = utils.run(["--output", "test_out", "--silent", dir + "code/src/stdin.js"]);

                expect(result.output).to.be.empty();
                expect(result.exitCode).to.equal(0);
                rimraf("test_out", {});
            });

            specify("no output should be generated but a non-zero exit code should be returned if an error occurs with --silent", () =>
            {
                const result = utils.run(["--silent", "-"], { stdin: "var x;\nx ==== 7;" });

                expect(result.output).to.be.empty();
                expect(result.exitCode).to.equal(2);
            });
        });

        context("--source-map", () =>
        {
            specify("code and source map should be generated with '--source-map'", () =>
            {
                compareWithFixture("code/src/source-map.txt");
            });

            specify("--source-map along with stdin should complain", () =>
            {
                let result = utils.run(["--source-map", "-"]);

                expect(result.output).to.match(/^objjc: error: --source-map and --source-map-only may not be used with stdin/);
            });
        });

        context("--source-map-only", () =>
        {
            specify("only a source map should be generated with '--source-map-only'", () =>
            {
                compareWithFixture("code/src/source-map-only.txt");
            });

            specify("--source-map-only along with stdin should complain", () =>
            {
                let result = utils.run(["--source-map-only", "-"]);

                expect(result.output).to.match(/^objjc: error: --source-map and --source-map-only may not be used with stdin/);
            });
        });

        context("--type-signatures", () =>
        {
            specify("no method type signatures should be generated with '--no-type-signatures'", () =>
            {
                compareWithFixture("code/src/no-type-signatures.j");
            });
        });
    });

    context("Input", () =>
    {
        specify("- as an argument should take input from stdin", () =>
        {
            compareWithFixture("code/src/stdin.js");
        });

        specify("an error should be generated if no input files are given", () =>
        {
            const result = utils.run([]);

            expect(result.output).to.match(/^objjc: error: no input files/);
            expect(result.exitCode).to.equal(2);
        });

        specify("an error should be generated if an input file does not exist", () =>
        {
            const result = utils.run(["foo.j"]);

            expect(result.output).to.match(/^objjc: error: no such file '.+foo.j'/);
            expect(result.exitCode).to.equal(2);
        });

        specify("an error should be generated if an input file is a directory", () =>
        {
            const result = utils.run(["test"]);

            expect(result.output).to.match(/^objjc: error: '.+test' is a directory/);
            expect(result.exitCode).to.equal(2);
        });
    });

    context("General options", () =>
    {
        specify("--list-formats should display a list of available formats", () =>
        {
            compareWithFixture("misc/list-formats.txt");
        });

        specify("--list-optional-warnings should display a list of optional warnings, indicating which are enabled by default", () =>
        {
            compareWithFixture("misc/list-optional-warnings.txt");
        });

        specify("--stack-trace should print a stack trace if an error occurs", () =>
        {
            const result = utils.run(["--stack-trace", "--format", "foo", dir + "code/src/format-name.js"]);

            expect(result.output).to.match(/^objjc: error: (no such format 'foo'\nAvailable formats: .+?)\n\nError: \1\n\s+at \w+/);
            expect(result.exitCode).to.equal(2);
        });

        specify("--version should display the objjc, acorn-objj and acorn versions ", () =>
        {
            const result = utils.run(["--version"]);

            expect(result.output).to.match(/^objjc v\d+\.\d+\.\d+(-(alpha|beta)\.\d+)? \(acorn-objj v\d+\.\d+\.\d+(-(alpha|beta)\.\d+)?, acorn v\d+\.\d+\.\d+\)/);
        });
    });
});
