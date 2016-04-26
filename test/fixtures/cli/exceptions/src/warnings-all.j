// warning
debugger;

var i = 13;

@implementation One

// shadowed var warning
- (void)test:(int)i
{
    // implicit global warning
    x = 7;
}

// unknown type warning
- (Foo)foo:(int)bar
{
    // unknown identifier warning
    var y = boo;
}

@end

@implementation Two : One

// return/parameter type warnings
- (void)foo:(double)bar
{
    // reserved word warning
    var NaN = "yo";
}

@end
