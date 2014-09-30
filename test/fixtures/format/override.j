@implementation Foo
{
    int bar;
}

- (id)test:(int)foo me:(id)bar
{
}

@end

@implementation Bar : Foo

- (CPObject)test:(BOOL)foo me:(CPString)bar
{
}

@end
