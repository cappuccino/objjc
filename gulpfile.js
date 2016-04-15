"use strict";

const
    del = require("del"),
    fs = require("fs"),
    gulp = require("gulp"),
    loadPlugins = require("gulp-load-plugins"),
    path = require("path"),
    runSequence = require("run-sequence"),
    through = require("through2").obj,
    utils = require("./test/lib/utils.js");

const // jscs: ignore requireMultipleVarDecl
    $ = loadPlugins(),
    paths = {
        lint: [
            "gulpfile.js",
            "lib/*.js",
            "test/*.js",
            "test/lib/*.js"
        ],
        fixturesBase: "test/fixtures",
        test: ["test/*.js"]
    };

// Cleaning

gulp.task("clean:build", () => del("build/*"));
gulp.task("clean:fixtures", () => del("test/fixtures/**/dest/*.{js,txt,map}"));
gulp.task("clean", cb => runSequence("clean:build", "clean:fixtures", cb));

// Linting

gulp.task("lint:eslint", () =>
    gulp.src(paths.lint)
        .pipe($.eslint({
            rulePaths: ["node_modules/eslint-config-cappuccino/lib/rules"],
            quiet: true
        }))
        .pipe($.eslint.format("node_modules/eslint-clang-formatter"))
        .pipe($.eslint.failAfterError())
);

gulp.task("lint:jscs", () =>
    gulp.src(paths.lint)
        .pipe($.jscs())
        .pipe($.jscs.reporter("jscs-clang-reporter"))
        .pipe($.jscs.reporter("fail"))
);

gulp.task("lint", cb => runSequence("lint:eslint", "lint:jscs", cb));

// Fixtures

function compileFixture(fixturesDir, options, file, encoding, cb)
{
    console.log(path.basename(file.path));

    const output = utils.compiledFixture(file.path, utils.setCompilerOptions(options, file.path));
    let text = options.captureStdout ? output.stdout : output.code;

    if (fixturesDir === "exceptions")
        text = utils.convertToPosixPaths(text);

    file.contents = new Buffer(text);

    if (options.sourceMap)
    {
        const parsed = path.parse(file.path);

        fs.writeFileSync(path.join(path.dirname(parsed.dir), "dest", parsed.name + ".js.map"), output.map);
    }

    cb(null, file);
}

function generateFixtures(fixturesDir, renameSpec, options)
{
    /*
        gulp.src/dest config is a bit tricky here because we want to put
        the destination files in a sibling directory of the source.
    */
    const srcDir = path.join(paths.fixturesBase, fixturesDir, "src");

    options = options || {};
    options.ignoreWarnings = fixturesDir !== "exceptions";

    const extension = (renameSpec.suffix || "") + renameSpec.extname;

    // Since we only need paths for the compiler, no need to read the file source.
    return gulp.src("./*", { cwd: srcDir, base: srcDir, read: false })

        // Only generate fixtures whose source has changed
        .pipe($.newer(makeNewerOptions(srcDir, extension)))

        // Compile with the given options, save the result in the vinyl file.content
        .pipe(through(compileFixture.bind(null, fixturesDir, options)))

        // Rename the compiled file
        .pipe($.rename(renameSpec))

        // Save the compiled code into the sibling dest directory
        .pipe(gulp.dest("../dest", { cwd: srcDir }));
}

/**
 * Create options for gulp-newer that will return a path in sourceDir/../dest
 *
 * @param {String} sourceDir - A relative path from the project root to the fixture source directory,
 * e.g. "test/fixtures/js-nodes/src".
 * @param {String} extension - Destination file suffix + extension.
 * @returns {{map: (function())}} - Absolute path to destination file to compare against.
 */
function makeNewerOptions(sourceDir, extension)
{
    const destDir = path.join(path.dirname(sourceDir), "dest");

    return {
        // Because cwd and base are set to the directory of the fixture source,
        // the relative path passed to the map function is actually just the filename.
        map: filename =>
        {
            // Strip the source filename extension, then add the destination suffix + extension
            filename = path.basename(filename, path.extname(filename)) + extension;

            // Return an absolute path to the destination file to compare against
            return path.join(process.cwd(), destDir, filename);
        }
    };
}

gulp.task("generate-fixtures:js", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("js-nodes", renameSpec);
});

gulp.task("generate-fixtures:objj", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("objj-nodes", renameSpec);
});

gulp.task("generate-fixtures:exceptions", () =>
{
    const renameSpec = { extname: ".txt" };

    return generateFixtures("exceptions", renameSpec, { captureStdout: true });
});

gulp.task("generate-fixtures:source-maps", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("source-maps", renameSpec, { sourceMap: true });
});

gulp.task("generate-fixtures", cb =>
{
    runSequence(
        "generate-fixtures:js",
        "generate-fixtures:objj",
        "generate-fixtures:exceptions",
        // "generate-fixtures:source-maps",
        cb
    );
});

gulp.task("regenerate-fixtures", cb => runSequence("clean:fixtures", "generate-fixtures", cb));

// Testing

function mochaTask(reporter)
{
    return function()
    {
        return gulp.src(paths.test)
            .pipe($.mocha({ reporter: reporter || "spec" }));
    };
}

gulp.task("mocha", mochaTask("spec"));
gulp.task("mocha-dot", mochaTask("dot"));

gulp.task("test", cb => runSequence("lint", "generate-fixtures", "mocha", cb));
gulp.task("default", ["test"]);
