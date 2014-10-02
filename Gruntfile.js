"use strict";

var cli = require("./lib/cli"),
    path = require("path"),
    utils = require("./test/lib/utils");

module.exports = function(grunt)
{
    // Project configuration.
    grunt.initConfig({
        clean: {
            test: {
                src: ["test/fixtures/**/*.{js,txt}"]
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
            test: {
                options: {
                    reporter: "spec",
                    colors: true,
                    useInlineDiffs: true,
                    bail: false,
                    slow: 500
                },
                src: ["test/*.js"]
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
    grunt.registerTask("fixtures", "Generate test fixtures.",  function()
    {
        var files = grunt.file.expand("test/fixtures/**/*.js");
        files.forEach(function(file) { grunt.file.delete(file, { force: true }); });
        files = grunt.file.expand("test/fixtures/{code,format}/*.j");

        files.forEach(function(file)
            {
                grunt.log.writeln(file);
                cli.run(["node", "objjc", "--quiet", "--no-source-map", "-o", path.dirname(file), file]);
            }
        );

        files = grunt.file.expand("test/fixtures/warnings/*.j");

        files.forEach(function(file)
            {
                grunt.log.writeln(file);

                var fixture = path.relative("test/fixtures", file),
                    output = utils.compiledFixture(fixture, { captureStdout: true }),
                    outputDir = path.dirname(file),
                    filename = path.basename(file, path.extname(file)) + ".txt";

                file = path.join(outputDir, filename);
                grunt.file.write(file, output.stdout);
            }
        );
    });
    grunt.registerTask("generateFixtures", ["clean", "fixtures"]);
};
