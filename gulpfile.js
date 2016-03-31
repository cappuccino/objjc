"use strict";

const
    del = require("del"),
    fs = require("fs"),
    gulp = require("gulp"),
    loadPlugins = require("gulp-load-plugins"),
    path = require("path"),
    runSequence = require("run-sequence"),
    through = require("through2").obj,
    utils = require("./test/lib/utils");

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

function compileFixture(fixturesSrc, options, file, encoding, cb)
{
    console.log(path.relative(fixturesSrc, file.path));

    const output = utils.compiledFixture(file.path, utils.setCompilerOptions(options, file.path));

    file.contents = new Buffer(options.captureStdout ? output.stdout : output.code);

    if (options.sourceMap)
    {
        const parsed = path.parse(file.path);

        fs.writeFileSync(path.join(parsed.dir, parsed.name + ".js.map"), output.map);
    }

    cb(null, file);
}

function generateFixtures(fixturesSrc, renameSpec, options)
{
    /*
        gulp.src/dest config is a bit tricky here because we want to put
        the destination files in a sibling directory of the source.

        Since we only need paths for the compiler, no need to read the file source.
    */
    fixturesSrc = path.join(paths.fixturesBase, fixturesSrc);
    options = options || {};
    options.ignoreWarnings = !fixturesSrc.startsWith("warnings");

    const extension = (renameSpec.suffix || "") + renameSpec.extname;

    return gulp.src("./*", { cwd: fixturesSrc, base: fixturesSrc, read: false })

        // Only generate fixtures whose source has changed
        .pipe($.newer(makeNewerOptions(fixturesSrc, extension)))

        // Compile with the given options, save the result in the vinyl file.content
        .pipe(through(compileFixture.bind(null, fixturesSrc, options)))

        // Rename the compiled file
        .pipe($.rename(renameSpec))

        // Save the compiled code into the sibling dest directory
        .pipe(gulp.dest("../dest", { cwd: fixturesSrc }));
}

function makeNewerOptions(sourceDir, extension)
{
    return {
        map: relativePath =>
        {
            relativePath = path.basename(relativePath, path.extname(relativePath)) + extension;

            const dir = path.dirname(path.resolve(relativePath));

            return path.join(dir, path.dirname(sourceDir), "dest", relativePath);
        }
    };
}

gulp.task("generate-fixtures:js", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("js-nodes/src", renameSpec);
});

gulp.task("generate-fixtures:objj", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("objj-nodes/src", renameSpec);
});

gulp.task("generate-fixtures", cb =>
{
    runSequence(
        "generate-fixtures:js",
        "generate-fixtures:objj",
        cb
    );

    // Compile warnings, save the warnings as .txt files
        /*
        .pipe(warningsFilter)
        .pipe($.newer({ dest, ext: ".txt" }))
        .pipe(through(partialRight(compileFixture, { captureStdout: true })))
        .pipe($.rename({ extname: ".txt" }))
        .pipe(gulp.dest(dest))
        .pipe(warningsFilter.restore)

        // Compile files that save source maps
        .pipe(sourceMapsFilter)
        .pipe($.newer({ dest, ext: ".js" }))
        .pipe(through(partialRight(compileFixture, { sourceMap: true })))
        .pipe($.rename({ extname: ".js" }))
        .pipe(gulp.dest(dest));
        */
});

gulp.task("regenerate-fixtures", cb => runSequence("clean:fixtures", "generate-fixtures", cb));

// Testing

gulp.task("mocha", () =>
    gulp.src(paths.test)
        .pipe($.mocha({ reporter: "dot" }))
);

gulp.task("test", cb => runSequence("lint", "generate-fixtures", "mocha", cb));
gulp.task("default", ["test"]);
