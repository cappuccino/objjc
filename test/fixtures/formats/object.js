var o = {
    one: "one", 
    foo: 2, 
    bar: 3, 
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
    }
};
