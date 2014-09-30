var foo = bar;
@implementation Test
{
}

-(void)test  :  (int)  arg {
    console.log(arg);
}

- (int)test:(float)arg
{}

@end
@implementation Foo
{
    CPString name;
}
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

@end


@implementation FooBar (Foo)

@end
@class Superclass
@implementation Subclass:Superclass
@end
"foobar"
