function test()
{
    // Outside of a method, using 'self' as a variable is legal
    var self = 7;
}

@implementation Test

- (void)test
{
    // error: 'self' used as a variable name
    var self = 7;
}

@end
