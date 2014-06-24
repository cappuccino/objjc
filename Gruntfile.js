"use strict";

var cli = require("./lib/cli"),
    glob = require("glob");

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
            options: {
                config: ".eslintrc"
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
                    reporter: "spec"
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
    grunt.registerTask("_generateFixtures", "Generate test fixtures.", function()
    {
        var files = glob.sync("test/fixtures/*.j");

        files.forEach(
            function(file)
            {
                grunt.log.writeln(file);
                cli.run(["node", "objjc", "--debug", "--no-source-map", "-o", "test/fixtures", file]);
            }
        );
    });
    grunt.registerTask("generateFixtures", ["clean", "_generateFixtures"]);
};
