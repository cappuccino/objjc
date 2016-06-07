"use strict";

const
    acorn = require("acorn"),
    acornObjj = require("acorn-objj"),
    chalk = require("chalk"),
    codeGenerator = require("./code_generator.js"),
    compiler = require("./compiler.js"),
    exceptions = require("./exceptions.js"),
    fs = require("fs"),
    issueHandler = require("acorn-issue-handler"),
    mkdirp = require("mkdirp").sync,
    path = require("path");

// Most acorn options don't make sense here.
// We don't support ecmaVersion yet because we only handle ES5.
const validAcornOptions = new Set([ // jscs: ignore requireMultipleVarDecl
    "locations",
    "sourceType",
    "strictSemicolons",
    "allowReturnOutsideFunction",
    "allowHashBang",
    "directSourceFile"
]);

class Runner
{
    constructor(options)
    {
        this.options = this.constructor.setupOptions(options || /* istanbul ignore next */ {});
        this.compiler = null;
        this.issues = new issueHandler.IssueList();
        global.DEBUG = !!this.options.debug;
    }

    static getEnvironment()
    {
        if (!this.environment)
        {
            const pkg = require("../package.json");

            this.environment = {
                executable: Object.keys(pkg.bin)[0],
                version: pkg.version,
                acornObjjVersion: acornObjj.cli.getEnvironment().version,
                acornVersion: acorn.version
            };
        }

        return this.environment;
    }

    static setupWarnings(/* Array */ warnings)
    {
        const result = Object.create(null);
        let warningMode = "none";

        Object.assign(result, compiler.defaultOptions.warnings);

        warnings.every(warning =>
        {
            let value = true;

            if (warning === "all" || warning === "none")
            {
                value = warning === "all";

                for (const key of Object.keys(result))
                    result[key] = value;

                return false; // Abort every()
            }

            if (warning.startsWith("no-"))
            {
                if (warningMode === "set")
                    warningMode = "mixed";
                else
                {
                    warning = warning.substring("no-".length);
                    value = false;
                    warningMode = "exclusive";
                }
            }
            else if (warning.startsWith("+"))
            {
                if (warningMode === "set")
                    warningMode = "mixed";
                else
                {
                    warning = warning.substring(1);
                    value = true;
                    warningMode = "inclusive";
                }
            }
            else if (warningMode === "none")
            {
                // On the first "set" warning, reset all to false
                for (const key of Object.keys(result))
                    result[key] = false;

                warningMode = "set";
            }
            else if (warningMode !== "set")
                warningMode = "mixed";

            if (warningMode === "mixed")
            {
                console.warn(`objjc: ${chalk.yellow.bold("warning:")} listing specific compiler warnings may not be mixed with inclusive/exclusive warnings`); // eslint-disable-line max-len

                return false; // Abort every()
            }

            if (compiler.defaultOptions.warnings.hasOwnProperty(warning))
                result[warning] = value;
            else
                console.warn(`objjc: ${chalk.yellow.bold("warning:")} unknown compiler warning '${warning}'`);

            return true;
        });

        return result;
    }

    // Copy all acorn options to a separate subobject
    static initAcornOptions(options)
    {
        // Start by setting up the acorn-objj options
        acornObjj.initOptions(options);

        // Next we start with the default acorn options
        const acornOptions = Object.assign({}, acorn.defaultOptions);

        // Go through the passed in options, for each one
        // that is an acorn option, move its value to acornOptions.
        for (const key of Object.keys(options))
        {
            if (acornOptions.hasOwnProperty(key))
            {
                acornOptions[key] = options[key];
                delete options[key];
            }
        }

        if (options.strictSemicolons)
            acornOptions.strictSemicolons = true;

        // For now we limit ecmaVersion to 5 since we don't handle ES6 nodes yet
        acornOptions.ecmaVersion = Math.min(acornOptions.ecmaVersion || 5, 5);

        // If source map generation is on, we need locations in the AST
        acornOptions.locations = options.sourceMap;

        // Remove acorn options that don't make sense in this context
        for (const key of Object.keys(acornOptions))
        {
            if (!validAcornOptions.has(key))
                delete acornOptions[key];
        }

        options.acornOptions = acornOptions;
    }

    static setupOptions(options)
    {
        chalk.enabled = options.color;
        this.initAcornOptions(options);

        const newOptions = Object.assign({}, options);

        for (const option in compiler.defaultOptions)
        {
            if (options.hasOwnProperty(option))
            {
                if (option === "warnings" && Array.isArray(options.warnings))
                    newOptions[option] = this.setupWarnings(options.warnings);
                else
                    newOptions[option] = options[option];
            }
            else
            {
                const defaultOption = compiler.defaultOptions[option];

                newOptions[option] = typeof defaultOption === "function" ? defaultOption() : defaultOption;
            }
        }

        return newOptions;
    }

    makeOutputDir()
    {
        const
            outputPath = path.resolve(this.options.output),
            targetDir = this.options.useStdin ? path.dirname(outputPath) : outputPath;

        try
        {
            mkdirp(targetDir);
        }
        catch (e)
        {
            // istanbul ignore next: failsafe
            throw new Error(`could not create output directory (${e.message})`);
        }
    }

    setupCompile()
    {
        if (this.options.output)
            this.makeOutputDir();
    }

    getDestPath(sourceFile)
    {
        let destPath;

        if (this.options.output)
        {
            const outputPath = path.resolve(this.options.output);

            if (this.options.useStdin)
                sourceFile = outputPath;

            const baseFilename = path.basename(sourceFile, path.extname(sourceFile));

            if (this.options.useStdin)
                destPath = path.join(path.dirname(outputPath), baseFilename);
            else
                destPath = path.join(outputPath, baseFilename);

            destPath += ".js";
        }
        else
            destPath = path.basename(sourceFile, path.extname(sourceFile)) + ".js";

        return destPath;
    }

    generate(sourceFile, destPath)
    {
        const generateCode = !this.options.sourceMapOnly;

        if (this.options.output)
        {
            // istanbul ignore else: no need to test else
            if (generateCode)
                fs.writeFileSync(destPath, this.compiler.code);

            if (this.options.sourceMap)
                fs.writeFileSync(destPath + ".map", this.compiler.sourceMap);
        }
        else if (!this.options.quiet)
        {
            if (generateCode)
                console.log(this.compiler.code);

            if (this.options.sourceMap)
                console.log(this.compiler.sourceMap);
        }
    }

    compileFiles(files)
    {
        let exitCode = Runner.EXIT_STATUS_SUCCESS;

        this.setupCompile();

        for (const file of files)
        {
            const sourcePath = path.resolve(file);

            exitCode = Math.max(this.compileFileOrSource(sourcePath), exitCode);
        }

        return exitCode;
    }

    compileSource(sourcePath, source)
    {
        this.setupCompile();

        return this.compileFileOrSource(sourcePath, source);
    }

    compileFileOrSource(sourcePath, source)
    {
        let exitCode = Runner.EXIT_STATUS_SUCCESS,
            error,
            stackTrace;

        this.sourcePath = sourcePath;

        if (source)
        {
            // istanbul ignore else: no need to test this
            if (this.options.objjScope === undefined)
                this.options.objjScope = false;
        }
        else
        {
            if (this.options.objjScope === undefined)
                this.options.objjScope = sourcePath.endsWith(".j");

            try
            {
                source = fs.readFileSync(sourcePath, { encoding: "utf8" });
            }
            catch (e)
            {
                switch (e.code)
                {
                    case "ENOENT":
                        error = `no such file '${sourcePath}'`;
                        break;

                    case "EISDIR":
                        error = `'${sourcePath}' is a directory`;
                        break;

                    // istanbul ignore next: failsafe
                    default:
                        error = `could not read file (${e.message})`;
                }

                throw new Error(error);
            }
        }

        this.source = source;

        const acornOptions = this.options.acornOptions || /* istanbul ignore next */ {};

        // istanbul ignore else: no need to test
        if (!acornOptions.file)
            acornOptions.file = compiler.Compiler.getRelativeSourcePath(sourcePath);

        acornOptions.directSourceFile = acornOptions.file;

        try
        {
            const ast = acornObjj.parse.parse(source, acornOptions, this.issues);

            if (this.options.ast === undefined)
            {
                const destPath = this.getDestPath(sourcePath);

                this.compiler = new compiler.Compiler(source, sourcePath, destPath, ast, this.issues, this.options);
                this.compiler.compileWithFormat(codeGenerator);

                if (!this.options.silent && this.compiler.errorCount === 0)
                    this.generate(sourcePath, destPath);
            }
            else if (!this.options.silent && !this.options.quiet)
                console.log(JSON.stringify(ast, null, this.options.ast));
        }
        catch (ex)
        {
            if (!this.options.silent)
            {
                if (!issueHandler.isIssue(ex))
                {
                    error = ex;

                    if (this.options.stackTrace)
                        stackTrace = ex.stack;

                    exitCode = Runner.EXIT_STATUS_ERRORS;
                }
            }
        }

        if (this.issues.length > 0)
        {
            if (this.compiler && exitCode === Runner.EXIT_STATUS_SUCCESS)
            {
                exitCode = this.compiler.errorCount > 0 ?
                           Runner.EXIT_STATUS_ERRORS :
                           Runner.EXIT_STATUS_WARNINGS;
            }
            else
                exitCode = Runner.EXIT_STATUS_ERRORS;

            if (!this.options.silent)
            {
                let Reporter;

                // istanbul ignore if: no need to test
                if (this.options.reporter)
                    Reporter = this.options.reporter;
                else
                    Reporter = issueHandler.reporters.ConsoleReporter;

                const reporter = new Reporter(this.options.colorize);

                reporter.report(this.issues);

                if (error)
                    console.log(); // Add a blank line before exception message
            }
        }

        if (error && !this.options.silent)
        {
            let message = error.message;

            if (error instanceof exceptions.CompileAbortedError)
                message = "compilation aborted, " + message;

            console.log(this.constructor.getEnvironment().executable + ": " + chalk.red("error: ") + message);

            if (this.options.stackTrace)
                console.log("\n" + (stackTrace || /* istanbul ignore next */ error.getStackTrace(Runner.STACK_FILTER)));
        }

        return exitCode;
    }
}

Runner.EXIT_STATUS_SUCCESS = 0;
Runner.EXIT_STATUS_WARNINGS = 1;
Runner.EXIT_STATUS_ERRORS = 2;

Runner.STACK_FILTER = [String.raw`Parser\.acorn\.Parser\.objj_raise`];

Runner.environment = null;

module.exports = Runner;
