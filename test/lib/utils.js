"use strict";

const
    captureStream = require("capture-stream"),
    exists = require("path-exists").sync,
    expect = require("code").expect,
    fs = require("fs"),
    issueHandler = require("acorn-issue-handler"),
    path = require("path"),
    Runner = require("../../lib/runner");

exports.readFixture = name =>
{
    const parsed = path.parse(name);

    if (parsed.ext === ".map")
    {
        parsed.name = path.basename(parsed.name, path.extname(parsed.name));
        parsed.ext = ".js.map";
    }

    const fixturePath = path.join("test", "fixtures", parsed.dir, parsed.base);

    expect(exists(fixturePath)).to.be.true();

    return fs.readFileSync(fixturePath, { encoding: "utf8" });
};

function compiledSourceOrFixture(source, file, options)
{
    const defaultOptions = {
        acornOptions: {},
        maxErrors: 100,
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

        const compiler = runner.getCompiler();

        return {
            code: compiler ? compiler.getCode() : "",
            map: (compiler && options.sourceMap) ? compiler.getSourceMap() : "",
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

    return compiledSourceOrFixture("", sourcePath, options);
};

exports.compiledSource = (source, options) => compiledSourceOrFixture(source, "", options);

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
            // If the description ends with "-statements", trim that off
            const matches = fixture.match(/\/(.+)-statements$/);

            if (matches !== null)
                fixture = path.join(path.dirname(fixture), matches[1]);
        }

        makeDescribe(description, should, fixture);
    }
};

exports.setCompilerOptions = (options, file) =>
{
    options = Object.assign({}, options);

    const filename = path.basename(file);

    switch (filename)
    {
        case "inline-msg-send-expression.j":
            options.inlineMsgSend = true;
            break;

        case "no-types.j":
            options.generateTypeSignatures = false;
            break;

        case "no-method-names.j":
            options.generateMethodNames = false;
            break;

        default:
            break;
    }

    return options;
};

exports.convertToPosixPaths = text => text.replace(/^\s*[^:]+/gm, match => match.replace(/\\/g, "/"));
