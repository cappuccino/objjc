@class CPString
var foo = 7;

@protocol SomeProtocol
@end

@implementation Foo
{
    CPString name;
}
- (int)test:(id<SomeProtocol>)arg
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
    return [Bar stringWithFormat:@"%s %s", firstName, lastName];
}
- ( CPString ) addContactWithFirstName : (CPString )first   lastName  :(CPString )  last
{
    firstName = first;
    lastName = last;
    BarCount++;
}
- (int)test:(id<SomeProtocol>)arg
{}

+ (id)stringWithFormat:(CPString)format, ...
{
}

@end


@implementation Foo (Category)
@end
"foobar"
