"use strict";

const
    captureStream = require("capture-stream"),
    cli = require("../../lib/cli.js"),
    exists = require("path-exists").sync,
    expect = require("code").expect,
    fs = require("fs"),
    issueHandler = require("acorn-issue-handler"),
    path = require("path"),
    pathExists = require("path-exists").sync,
    Runner = require("../../lib/runner"),
    stripColor = require("chalk").stripColor;

exports.run = function(args, options)
{
    options = options || {};
    options.parseOptions = Object.assign({}, options.parseOptions, { slice: 0 });

    const
        restoreStdout = captureStream(process.stdout),
        restoreStderr = captureStream(process.stderr),
        exitCode = cli.run(args, options),
        output = stripColor(restoreStderr(true) + restoreStdout(true));

    return { exitCode, output };
};

exports.readFixture = name =>
{
    const parsed = path.parse(name);

    if (parsed.ext === ".map")
    {
        parsed.name = path.basename(parsed.name, path.extname(parsed.name));
        parsed.ext = ".js.map";
    }

    const fixturePath = path.join("test/fixtures", parsed.dir, parsed.base);

    expect(exists(fixturePath)).to.be.true();

    return fs.readFileSync(fixturePath, { encoding: "utf8" });
};

function compiledSourceOrFixture(source, file, options)
{
    const defaultOptions = {
        acornOptions: {},
        maxErrors: 0,
        quiet: true,
        warnings: ["all"]
    };

    options = Object.assign({}, defaultOptions, options);

    let restore;

    try
    {
        if (options.captureStdout)
        {
            restore = captureStream(process.stdout);
            options.reporter = issueHandler.StandardReporter;
        }
        else
            options.reporter = issueHandler.SilentReporter;

        delete options.captureStdout;

        const runner = new Runner(options);
        let stdout;

        runner.compileFileOrSource(file, source);

        if (restore)
            stdout = restore(true);
        else
            stdout = "";

        const compiler = runner.compiler;

        return {
            code: compiler ? compiler.code : "",
            map: (compiler && options.sourceMap) ? compiler.sourceMap : "",
            stdout
        };
    }
    catch (ex)
    {
        if (restore)
            restore();

        console.error(ex.message);
    }

    return { code: "", map: "", stdout: "" };
}

exports.compiledFixture = (file, options) =>
{
    if (path.extname(file) === "")
        file += ".j";

    let sourcePath = file;

    if (!path.isAbsolute(file))
        sourcePath = path.resolve(path.join("test", "fixtures", file));

    if (!pathExists(sourcePath))
        throw new Error("No such fixture: " + sourcePath);

    return compiledSourceOrFixture("", sourcePath, options);
};

exports.compiledSource = (source, options) => compiledSourceOrFixture(source, "", options);

// This maps fixture names to options passed to the cli
const cliFixtureArgs = {
    "ast-0.txt": ["--ast", "0"],
    "ast-2.txt": ["--ast", "2"],
    "environment-browser.js": ["--environment", "browser"],
    "environment-node.js": ["--environment", "node"],
    "max-errors-1.j": ["--max-errors", "1"],
    "max-errors-0.j": ["--max-errors", "0"],
    "warnings-all.j": ["--warnings", "all"],
    "warnings-none.j": ["--warnings", "none"],
    "warnings-enable-disable.j": ["--warnings", "+parameter-types,no-implicit-globals"],
    "warnings-list.j": ["--warnings", "debugger,unknown-types"],
    "warnings-mixed.j": ["--warnings", "debugger,+shadowed-vars"],
    "warnings-unknown.j": ["--warnings", "debugger,shadowed-var"],
    "format-name.js": ["--format", "cappuccino"],
    "format-path.js": ["--format", "formats/cappuccino.json"],
    "format-bad.js": ["--format", "foo"],
    "objj-scope.j": ["--objj-scope", "false"],
    "quiet.j": ["--source-map", "--quiet"]
};

exports.convertIssuePathsToPosix = text => text.replace(
    /^\s*[^:]+/gm,
    match => match.replace(/\\/g, "/")
);

function convertASTPathsToPosix(result)
{
    result.output = result.output.replace(
        /("sourceFile":\s*)"([^"]+)"/g,
        // Because the AST is JSON, paths are quoted and thus backslashes are doubled
        (match, key, filePath) => key + "\"" + filePath.replace(/\\\\/g, "/") + "\""
    );
}

exports.compiledCliFixture = function(filePath)
{
    const filename = path.basename(filePath);
    let args = cliFixtureArgs[filename];

    if (!args)
    {
        // Use the filename without extension as the arg
        const arg = path.basename(filename, path.extname(filename));

        args = ["--" + arg];
    }
    else if (!Array.isArray(args))
        args = [args];

    args.push(filePath);

    const result = exports.run(args);

    if (filePath.includes("/exceptions/"))
        result.output = exports.convertIssuePathsToPosix(result.output);
    else if (filename.startsWith("ast-"))
        convertASTPathsToPosix(result);

    return result;
};

exports.compiledMiscCliFixture = function(test, alwaysCompile)
{
    let args = ["--" + test];

    const dest = `test/fixtures/cli/misc/${test}.txt`;

    if (alwaysCompile || !pathExists(dest))
    {
        const result = exports.run(args);

        return {
            exitCode: result.exitCode,
            output: result.output,
            dest
        };
    }

    return null;
};

function makeDescribe(description, should, fixture)
{
    describe(description, () =>
    {
        it(should, () =>
        {
            expect(exports.compiledFixture(fixture).code).to.equal(exports.readFixture(fixture + ".js"));
        });
    });
}

exports.makeDescribes = (data, pathPrefix) =>
{
    for (let i = 0; i < data.length; i++)
    {
        const
            info = data[i],
            description = info[0],
            should = info[1],
            filename = info[2];

        let fixture = path.join(pathPrefix, filename ? filename : description.replace(" ", "-"));

        if (!exists(path.join("test", "fixtures", fixture)))
        {
            console.warn("No such fixture: %s", fixture);
            continue;
        }

        makeDescribe(description, should, fixture);
    }
};

const compilerOptions = {
    "no-types": { typeSignatures: false },
    "no-method-names": { methodNames: false }
};

exports.setCompilerOptions = (options, file) =>
{
    options = Object.assign({}, options);

    const filename = path.basename(file, path.extname(file));
    let specialOptions = compilerOptions[filename];

    if (!specialOptions)
    {
        if (filename.startsWith("inline-") || filename.endsWith("-inline"))
            specialOptions = { inlineMsgSend: true };
    }

    return Object.assign(options, specialOptions);
};
