var foo = 7;
@implementation Foo
{
    CPString name;
}
- (int)test:(float)arg
{}
@end
"bar"

var BarCount = 0;

@implementation Bar : Foo
{
    CPString firstName;
    CPString lastName;
}

+ (int)contactCount
{
    return BarCount;
}

- (CPString)fullName
{
    return firstName + " " + lastName;
}
- ( CPString ) addContactWithFirstName : (CPString )first   lastName  :(CPString )  last
{
    firstName = first;
    lastName = last;
    BarCount++;
}
- (void)test:(int)arg
{}

@end


@implementation FooBar (Foo)

@end
@class Superclass
@class AnotherClass
@implementation Subclass:Superclass
@end
"foobar"
