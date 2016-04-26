// warning
debugger;

var i = 13;

@implementation One

// shadowed var warning
- (void)test:(int)i
{
    // implicit global warning - disabled
    x = 7;
}

// unknown type warning - disabled by default
- (Foo)foo:(int)bar
{
    // unknown identifier warning
    var y = boo;
}

@end

@implementation Two : One

// return/parameter type warnings - enabled
- (void)foo:(double)bar
{
    // reserved word warning - not optional
    var NaN = "yo";
}

@end
