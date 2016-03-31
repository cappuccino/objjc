// Second Foo warns but is ignored
@class Foo
@class Bar, Foobar, Foo

@implementation Test
{
    Foo foo;
    Bar bar;
    Foobar foobar;
}
@end

// No warning, @implementation replaces @class
@implementation Foo
@end

// Warn but ignore
@class Foo
