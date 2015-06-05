"use strict";

var del = require("del"),
    fs = require("fs"),
    gulp = require("gulp"),
    loadPlugins = require("gulp-load-plugins"),
    path = require("path"),
    runSequence = require("run-sequence"),
    stylish = require("gulp-jscs-stylish");

// jscs: disable requireMultipleVarDecl

var $ = loadPlugins();

// jscs: enable

// Cleaning

gulp.task("clean:build", function(done)
{
    del("build/*", done);
});

gulp.task("clean:fixtures", function(done)
{
    del("test/fixtures/**/*.{js,txt,map}", done);
});

gulp.task("clean", function(cb)
{
    runSequence("clean:build", "clean:fixtures", cb);
});

// Linting

var sourceFiles = ["gulpfile.js", "lib/*.js", "test/*.js"];

gulp.task("lint:eslint", function()
{
    return gulp.src(sourceFiles)
        .pipe($.eslint())
        .pipe($.eslint.format("stylish"));
});

gulp.task("lint:jscs", function()
{
    return gulp.src(sourceFiles)
        .pipe($.jscs())
        .on("error", function() {})
        .pipe(stylish());
});

gulp.task("lint", function(cb)
{
    runSequence("lint:eslint", "lint:jscs", cb);
});

gulp.task("mocha", function()
{
    return gulp.src("test/*.js")
        .pipe($.mocha({ reporter: "dot" }));
});

// Fixtures

var fixturesPath;

function compileFixture(file, encoding, cb, options)
{
    var utils = require("./test/lib/utils");

    console.log(path.relative(fixturesPath, file.path));

    var output = utils.compiledFixture(file.path, options);

    file.contents = new Buffer(options.captureStdout ? output.stdout : output.code);

    if (options.sourceMap)
    {
        var parsed = path.parse(file.path);

        fs.writeFileSync(path.join(parsed.dir, parsed.name + ".js.map"), output.map);
    }

    cb(null, file);
}

gulp.task("generate-fixtures", function()
{
    var partialRight = require("lodash/function/partialright"),
        through = require("through2").obj;

    // jscs: disable requireMultipleVarDecl

    var normalFilter = $.filter("**/{code,formats}/*.j"),
        warningsFilter = $.filter("**/warnings/*.j"),
        sourceMapsFilter = $.filter("**/source-maps/*.j"),
        dest = "test/fixtures";

    // jscs: enable

    fixturesPath = path.resolve(dest);

    // Don't read the files, we only need the paths for the compiler
    return gulp.src("./**/*.j", { cwd: dest, read: false })

        // Compile files that need no special treatment
        .pipe(normalFilter)
        .pipe($.newer({ dest: dest, ext: ".js" }))
        .pipe(through(partialRight(compileFixture, {})))
        .pipe($.rename({ extname: ".js" }))
        .pipe(gulp.dest(dest))
        .pipe(normalFilter.restore())

        // Compile warnings, save the warnings as .txt files
        .pipe(warningsFilter)
        .pipe($.newer({ dest: dest, ext: ".txt" }))
        .pipe(through(partialRight(compileFixture, { captureStdout: true })))
        .pipe($.rename({ extname: ".txt" }))
        .pipe(gulp.dest(dest))
        .pipe(warningsFilter.restore())

        // Compile files that save source maps
        .pipe(sourceMapsFilter)
        .pipe($.newer({ dest: dest, ext: ".js" }))
        .pipe(through(partialRight(compileFixture, { sourceMap: true })))
        .pipe($.rename({ extname: ".js" }))
        .pipe(gulp.dest(dest));
});

gulp.task("regenerate-fixtures", function(cb)
{
    runSequence("clean:fixtures", "generate-fixtures", cb);
});

gulp.task("test", function(cb)
{
    runSequence("lint", "generate-fixtures", "mocha", cb);
});
