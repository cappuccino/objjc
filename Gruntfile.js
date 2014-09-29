"use strict";

var cli = require("./lib/cli");

module.exports = function(grunt)
{
    // Project configuration.
    grunt.initConfig({
        clean: {
            test: {
                src: ["test/fixtures/*.js"]
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
                    require: "chai",
                    reporter: "spec",
                    colors: true,
                    useInlineDiffs: true,
                    bail: false,
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
    grunt.registerTask("generateFixtures", "Generate test fixtures.", function()
    {
        var files = grunt.file.expand("test/fixtures/*.js");
        files.forEach(function(file) { grunt.file.delete(file, { force: true }); });
        files = grunt.file.expand("test/fixtures/*.j");

        files.forEach(function(file)
            {
                grunt.log.writeln(file);
                cli.run(["node", "objjc", "--debug", "--no-source-map", "-o", "test/fixtures", file]);
            }
        );
    });
};
