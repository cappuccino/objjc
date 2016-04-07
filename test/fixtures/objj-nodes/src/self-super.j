@implementation CPObject
@end

@implementation Test : CPObject

- (void)test
{
    [self doSomething];
    [super doSomething];

    function testme()
    {
        [self doSomething];
        [super doSomething];
    }
}

@end
