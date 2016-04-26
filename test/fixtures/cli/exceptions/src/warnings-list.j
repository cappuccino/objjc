// warning - enabled
debugger;

var i = 13;

@implementation One

// shadowed var warning - disabled
- (void)test:(int)i
{
    // implicit global warning - disabled
    x = 7;
}

// unknown type warning - enabled
- (Foo)foo:(int)bar
{
    // unknown identifier warning - disabled
    var y = boo;
}

@end

@implementation Two : One

// return/parameter type warnings - disabled
- (void)foo:(double)bar
{
    // reserved word warning - not optional
    var NaN = "yo";
}

@end
