var a = 7, o = {one :"one",foo   :2,
bar: 3,clean
: {    test:{src: ["test/fixtures/**/*.{js,txt}"]}},
        eslint: {
        gruntfile: {
  src: "Gruntfile.js"
              },lib: {
src: ["lib/*.js"]},test:{
                     src: ["test/*.js"]
}
    },mochaTest:{test:{options: {reporter: "spec",colors: true,useInlineDiffs: true,
bail: false,slow: 500},src: [
"test/*.js", "test/*.j"
]}},
empty:{
},
func: function() { var aa = 7; return aa; },
multi_line_array: [ 1,2,   3, 4 ],
lambda: function(foo){},
lambda2:function(bar)
{
return 7;
},
},
b = 13;
o.func();
