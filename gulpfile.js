/*
 * gulfile.js
 *
 * Created by Aparajita Fishman.
 * Copyright 2015, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var del = require("del"),
    gulp = require("gulp"),
    loadPlugins = require("gulp-load-plugins"),
    path = require("path");

var plugins = loadPlugins();

// cleaning

gulp.task("clean:build", function(done)
{
    del("build/*", done);
});

gulp.task("clean:fixtures", function(done)
{
    del("test/fixtures/**/*.{js,txt,map}", done);
});

gulp.task("clean", gulp.parallel("clean:build", "clean:fixtures"));

// linting

gulp.task("lint:eslint", function()
{
    return gulp.src(["gulpfile.js", "lib/*.js", "test/*.js"])
        .pipe(plugins.eslint())
        .pipe(plugins.eslint.format("stylish"));
});

gulp.task("lint", gulp.series("lint:eslint"));

gulp.task("mocha", function()
{
    return gulp.src("test/*.js")
        .pipe(plugins.mocha({ reporter: "spec" }));
});

// fixtures

var fixturesPath;

function compileFixture(file, encoding, cb, options)
{
    var utils = require("./test/lib/utils");

    console.log(path.relative(fixturesPath, file.path));

    var output = utils.compiledFixture(file.path, options);

    file.contents = new Buffer(options.captureStdout ? output.stdout : output.code);

    if (options.sourceMap)
    {
        var fs = require("fs");

        var parsed = path.parse(file.path);

        fs.writeFileSync(path.join(parsed.dir, parsed.name + ".js.map"), output.map);
    }

    cb(null, file);
}

gulp.task("generate-fixtures", function()
{
    var partialRight = require("lodash/function/partialright"),
        through = require("through2").obj;

    var normalFilter = plugins.filter("**/{code,formats}/*.j"),
        warningsFilter = plugins.filter("**/warnings/*.j"),
        sourceMapsFilter = plugins.filter("**/source-maps/*.j"),
        dest = "test/fixtures";

    fixturesPath = path.resolve(dest);

    // Don't read the files, we only need the paths for the compiler
    return gulp.src("./**/*.j", { cwd: dest, read: false })
        // Compile files that need no special treatment
        .pipe(normalFilter)
        .pipe(plugins.newer({ dest: dest, ext: ".js" }))
        .pipe(through(partialRight(compileFixture, {})))
        .pipe(plugins.rename({ extname: ".js" }))
        .pipe(gulp.dest(dest))
        .pipe(normalFilter.restore())

        // Compile warnings, save the warnings as .txt files
        .pipe(warningsFilter)
        .pipe(plugins.newer({ dest: dest, ext: ".txt" }))
        .pipe(through(partialRight(compileFixture, { captureStdout: true })))
        .pipe(plugins.rename({ extname: ".txt" }))
        .pipe(gulp.dest(dest))
        .pipe(warningsFilter.restore())

        // Compile files that save source maps
        .pipe(sourceMapsFilter)
        .pipe(plugins.newer({ dest: dest, ext: ".js" }))
        .pipe(through(partialRight(compileFixture, { sourceMap: true })))
        .pipe(plugins.rename({ extname: ".js" }))
        .pipe(gulp.dest(dest));
});

gulp.task("regenerate-fixtures", gulp.series("clean:fixtures", "generate-fixtures"));

gulp.task("test", gulp.series("lint", "generate-fixtures", "mocha"));
