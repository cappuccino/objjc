/*
 * utils.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var chai = require("chai"),
    exists = require("path-exists").sync,
    fs = require("fs"),
    path = require("path"),
    reporter = require("../../lib/reporter"),
    Runner = require("../../lib/runner"),
    format = require("util").format;

chai.should();

chai.Assertion.addMethod("equalFixture", function(name)
{
    var obj = this._obj;

    new chai.Assertion(typeof obj).to.equal("string");

    var parsed = path.parse(name),
        type;

    switch (parsed.ext)
    {
        case ".txt":
            type = "compiler warnings/errors";
            break;

        case ".map":
            type = "source map";
            parsed.name = path.basename(parsed.name, path.extname(parsed.name));
            parsed.ext = ".js.map";
            break;

        default:
            type = "compiled code";
    }

    var sourceName = parsed.name + ".j",
        sourcePath = path.join("test", "fixtures", parsed.dir, sourceName),
        filename = parsed.base,
        fixturePath = path.join("test", "fixtures", parsed.dir, filename),
        contents;

    try
    {
        contents = fs.readFileSync(fixturePath, { encoding: "utf8" });
    }
    catch (e)
    {
        var error;

        if (e.code === "ENOENT")
            error = "expected to find the fixture '" + fixturePath + "'";
        else
            error = e.message;

        this.assert(
            false,
            error,
            error,
            null,
            null,
            false
        );
    }

    this.assert(
        obj === contents,
        format("expected %s of %s to match %s", type, sourcePath, fixturePath),
        format("expected %s of %s to not match %s", type, sourcePath, fixturePath),
        obj, // expected
        contents, // actual
        true  // show diff
    );
});

var compiledFixture = function(file, options)
{
    if (path.extname(file) === "")
        file += ".j";

    var sourcePath = file;

    if (!path.isAbsolute(file))
        sourcePath = path.resolve(path.join("test", "fixtures", file));

    options = options || {};

    var hook;

    try
    {
        if (options.captureStdout)
            hook = captureStream(process.stdout, true);

        options = {
            sourceMap: options.sourceMap,
            acornOptions: {},
            quiet: true,
            warnings: options.warnings || ["all"],
            maxErrors: options.maxErrors || 100,
            reporter: options.captureStdout ? reporter.StandardReporter : reporter.SilentReporter
        };

        var runner = new Runner(options),
            stdout;

        runner.compileFile(sourcePath);

        if (hook)
        {
            stdout = hook.captured();
            hook.unhook();
        }
        else
            stdout = "";

        var compiler = runner.getCompiler();

        return {
            code: compiler ? compiler.getCode() : "",
            map: (compiler && options.sourceMap) ? compiler.getSourceMap() : "",
            stdout: stdout
        };
    }
    catch (ex)
    {
        if (hook)
            hook.unhook();

        console.error(ex.message);
    }

    return { code: "", map: "", stdout: "" };
};

exports.compiledFixture = compiledFixture;

var captureStream = function(stream, silent)
{
    var oldWrite = stream.write,
        buffer = "";

    stream.write = function(chunk)
    {
        buffer += chunk.toString(); // chunk is a String or Buffer

        if (!silent)
            oldWrite.apply(stream, arguments);
    };

    return {
        unhook: function unhook()
        {
            stream.write = oldWrite;
        },
        captured: function()
        {
            return buffer;
        }
    };
};

exports.captureStream = captureStream;

/* global describe, it */
/* jshint loopfunc: true */
/*eslint-disable max-nested-callbacks, no-loop-func */

function makeDescribe(description, should, fixture)
{
    describe(description, function()
    {
        it(should, function()
        {
            compiledFixture(fixture).code.should.equalFixture(fixture + ".js");
        });
    });
}

exports.makeDescribes = function(data, pathPrefix)
{
    for (var i = 0; i < data.length; ++i)
    {
        var info = data[i],
            description = info[0],
            should = info[1],
            filename = info[2],
            fixture = path.join(pathPrefix, filename ? filename : description.replace(" ", "-"));

        if (!exists(path.join("test", "fixtures", fixture)))
        {
            // If the description ends with "-statements", trim that off
            var matches = fixture.match(/\/(.+)-statements$/);

            if (matches !== null)
                fixture = path.join(path.dirname(fixture), matches[1]);
        }

        makeDescribe(description, should, fixture);
    }
};
