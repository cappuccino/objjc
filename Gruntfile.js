"use strict";

var cli = require("./lib/cli"),
    path = require("path"),
    utils = require("./test/lib/utils");

function writeFixtures(grunt, which, options)
{
    var files = grunt.file.expand("test/fixtures/" + which + "/*.j");

    files.forEach(function(file)
    {
        grunt.log.writeln(file);

        var fixture = path.relative("test/fixtures", file),
            output = utils.compiledFixture(fixture, options),
            outputDir = path.dirname(file),
            baseName = path.basename(file, path.extname(file)),
            filename = baseName + (options.captureStdout ? ".txt" : ".js");

        file = path.join(outputDir, filename);
        grunt.file.write(file, options.captureStdout ? output.stdout : output.code);

        if (options.sourceMap)
        {
            file = path.join(outputDir, path.basename(file) + ".map");
            grunt.file.write(file, output.map);
        }
    });
}

module.exports = function(grunt)
{
    // Project configuration.
    grunt.initConfig({
        clean: {
            test: {
                src: ["test/fixtures/**/*.{js,txt,map}"]
            }
        },
        eslint: {
            gruntfile: {
                src: "Gruntfile.js"
            },
            lib: {
                src: ["lib/*.js"]
            },
            test: {
                src: ["test/*.js"]
            }
        },
        jshint: {
            options: {
                jshintrc: ".jshintrc"
            },
            gruntfile: {
                src: "Gruntfile.js"
            },
            lib: {
                src: ["lib/*.js"]
            },
            test: {
                src: ["test/*.js"]
            }
        },

        mochaTest: {
            options: {
                reporter: "spec",
                colors: true,
                useInlineDiffs: true,
                bail: false,
                slow: 500
            },
            code: {
                src: ["test/code.js"]
            },
            formats: {
                src: ["test/formats.js"]
            },
            "source-maps": {
                src: ["test/source-maps.js"]
            },
            warnings: {
                src: ["test/warnings.js"]
            }
        },

        watch: {
            gruntfile: {
                files: "<%= jshint.gruntfile.src %>",
                tasks: ["jshint:gruntfile"]
            },
            lib: {
                files: "<%= jshint.lib.src %>",
                tasks: ["jshint:lib"]
            },
            test: {
                files: "<%= jshint.test.src %>",
                tasks: ["jshint:test"]
            },
        },
    });

    // These plugins provide necessary tasks.
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-eslint");
    grunt.loadNpmTasks("grunt-mocha-test");

    grunt.registerTask("test", ["eslint", "jshint", "mochaTest"]);
    grunt.registerTask("default", ["test"]);
    grunt.registerTask("generateFixtures", "Generate test fixtures.", function()
    {
        var files = grunt.file.expand("test/fixtures/**/*.js");
        files.forEach(function(file) { grunt.file.delete(file, { force: true }); });
        files = grunt.file.expand("test/fixtures/{code,formats}/*.j");

        files.forEach(function(file)
            {
                grunt.log.writeln(file);
                cli.run(["node", "objjc", "--quiet", "--no-source-map", "-o", path.dirname(file), file]);
            }
        );

        writeFixtures(grunt, "warnings", { captureStdout: true });
        writeFixtures(grunt, "source-maps", { sourceMap: true });
    });
    grunt.registerTask("regenerateFixtures", ["clean", "generateFixtures"]);
};
