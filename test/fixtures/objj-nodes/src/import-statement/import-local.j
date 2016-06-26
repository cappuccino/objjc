@import "foo.j"
@import "foo/bar.j"

// X is defined in foo.j
var x = X;

// Y is defined in foo/bar.j
if (Y)
    console.log("Y!");
