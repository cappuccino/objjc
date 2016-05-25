// unknown identifier warning, but it's ignored
var foo = bar;

// unknown superclass error
@implementation Foo : Bar
@end

function test()
{
    // implicit global warning, but it's ignored
    x = 7;
}

// ignored warning
debugger;
