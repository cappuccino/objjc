"use strict";

const
    del = require("del"),
    exec = require("child_process").exec,
    fs = require("fs"),
    gulp = require("gulp"),
    loadPlugins = require("gulp-load-plugins"),
    mkdirp = require("mkdirp"),
    path = require("path"),
    PluginError = require("gulp-util").PluginError,
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

gulp.task("clean", () => del("test/fixtures/**/{dest,misc}/*.{js,txt,map}"));

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

function compileFixture(options, file, encoding, cb)
{
    let filePath = file.path;

    console.log(path.basename(filePath));
    options = utils.setCompilerOptions(options, filePath);

    if (path.basename(filePath) === "stdin.j")
        options.stdin = true;

    const output = utils.compiledFixture(filePath, options);

    let text = options.captureStdout ? output.stdout : output.code;

    if (file.path.includes("/exceptions/"))
        text = utils.convertIssuePathsToPosix(text);

    file.contents = new Buffer(text);

    if (options.sourceMap)
    {
        const parsed = path.parse(file.path);

        fs.writeFileSync(path.join(path.dirname(parsed.dir), "dest", parsed.name + ".js.map"), output.map);
    }

    cb(null, file);
}

function cliCompileFixture(options, file, encoding, cb)
{
    const result = utils.compiledCliFixture(file.path);

    console.log(path.basename(file.path));
    file.contents = new Buffer(result.output);
    cb(null, file);
}

function generateFixtures(fixturesDir, renameSpec, options, filenamePattern)
{
    filenamePattern = filenamePattern || "*{.js,.j,.txt}";
    options = options || {};
    options.ignoreWarnings = fixturesDir !== "exceptions";

    /*
        gulp.src/dest config is a bit tricky here because we want to put
        the destination files in a sibling directory of the source.
    */
    const
        srcDir = path.join(paths.fixturesBase, fixturesDir, "src"),
        compileFunc = fixturesDir.startsWith("cli") ? cliCompileFixture : compileFixture;

    // Since we only need paths for the compiler, no need to read the file source.
    return gulp.src("./" + filenamePattern, { cwd: srcDir, base: srcDir, read: false })

        // Only generate fixtures whose source has changed
        .pipe($.newer(makeNewerOptions(srcDir, renameSpec)))

        // Compile with the given options, save the result in the vinyl file.content
        .pipe(through(compileFunc.bind(null, options)))

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
 * @param {String|function(Object)} renameSpec - Destination file rename spec.
 * @returns {{map: (function())}} - Absolute path to destination file to compare against.
 */
function makeNewerOptions(sourceDir, renameSpec)
{
    const destDir = path.join(path.dirname(sourceDir), "dest");

    return {
        // Because cwd and base are set to the directory of the fixture source,
        // the relative path passed to the map function is actually just the filename.
        map: filename =>
        {
            let extension = path.extname(filename);

            if (typeof renameSpec === "function")
            {
                let spec = {
                    suffix: "",
                    extname: extension
                };

                renameSpec(spec);
                extension = spec.extname;
            }
            else
                extension = (renameSpec.suffix || "") + renameSpec.extname;

            // Strip the source filename extension, then add the destination suffix + extension
            const extraDir = path.dirname(filename);

            filename = path.basename(filename, path.extname(filename)) + extension;

            // Return an absolute path to the destination file to compare against
            return path.join(process.cwd(), destDir, extraDir, filename);
        }
    };
}

gulp.task("generate-fixtures:cli:code", () =>
{
    const renameSpec = pathSpec =>
    {
        pathSpec.extname = pathSpec.extname === ".txt" ? ".txt" : ".js";

        return pathSpec;
    };

    return generateFixtures("cli/code", renameSpec);
});

gulp.task("generate-fixtures:cli:exceptions", () =>
{
    const renameSpec = { extname: ".txt" };

    return generateFixtures("cli/exceptions", renameSpec);
});

gulp.task("generate-fixtures:cli:misc", cb =>
{
    mkdirp(path.join(paths.fixturesBase, "cli/misc"));

    for (const test of ["list-formats", "list-optional-warnings"])
    {
        const result = utils.compiledMiscCliFixture(test);

        if (result)
        {
            fs.writeFileSync(result.dest, result.output);
            console.log(path.basename(result.dest));
        }
    }

    cb();
});

gulp.task("generate-fixtures:cli", cb =>
{
    runSequence(
        "generate-fixtures:cli:code",
        "generate-fixtures:cli:exceptions",
        "generate-fixtures:cli:misc",
        cb
    );
});

gulp.task("generate-fixtures:js", () =>
{
    const renameSpec = { extname: ".js" };

    return generateFixtures("js-nodes", renameSpec);
});

gulp.task("generate-fixtures:objj", () =>
{
    const renameSpec = { extname: ".js" };

    generateFixtures("objj-nodes", renameSpec);

    const renameImport = function(spec)
    {
        spec.extname = ".js";
    };

    return generateFixtures("objj-nodes", renameImport, null, "import-statement/**/import-*.j");
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
        "generate-fixtures:cli",
        "generate-fixtures:js",
        "generate-fixtures:objj",
        "generate-fixtures:exceptions",
        cb
    );
});

gulp.task("regenerate-fixtures", cb => runSequence("clean", "generate-fixtures", cb));

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

let coverResults = "";

function istanbulExecArgs()
{
    return "node node_modules/istanbul/lib/cli.js";
}

gulp.task("cover", cb =>
{
    // Add --colors to force colorizing, normally chalk won't because
    // it doesn't think it is writing to a terminal.
    exec(
        `${istanbulExecArgs()} cover --colors node_modules/mocha/bin/_mocha -- --reporter dot --colors`,
        (error, stdout) =>
        {
            if (error)
            {
                error = new PluginError(
                    "istanbul cover",
                    {
                        message: error.message,
                        showStack: false
                    }
                );

                return cb(error);
            }

            coverResults = stdout;

            return cb();
        }
    );
});

gulp.task("show-cover", ["cover"], cb =>
{
    console.log(coverResults);
    cb();
});

gulp.task("check-cover", ["cover"], cb =>
{
    exec(`${istanbulExecArgs()} check-cover`, error =>
    {
        if (error)
        {
            error = new PluginError(
                "istanbul check-cover",
                {
                    message: "Coverage did not meet the thresholds",
                    showStack: false
                }
            );

            return cb(error);
        }

        return cb();
    });
});

gulp.task("test", cb => runSequence("lint", "check-cover", cb));
gulp.task("default", ["test"]);
