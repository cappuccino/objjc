// warning - off
debugger;

var i = 13;

@implementation One

// shadowed var warning - off
- (void)test:(int)i
{
    // implicit global warning - off
    x = 7;
}

// unknown type warning - off
- (Foo)foo:(int)bar
{
    // unknown identifier warning - off
    var y = boo;
}

@end

@implementation Two : One

// return/parameter type warnings - off
- (void)foo:(double)bar
{
    // reserved word warning - not optional
    var NaN = "yo";
}

@end
