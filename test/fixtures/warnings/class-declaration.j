@implementation Foo
{
    CPString name;
    CPString firstName;
}

-(void)test:(int)arg {
    console.log(arg);
}

-(void)test:(int)arg {
    console.log(arg);
}

@end


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

- (CPString) addContactWithFirstName:(CPString)first lastName:(CPString)last
{
    firstName = first;
    lastName = last;
    BarCount++;
}

- (int)test:(float)arg
{
}

@end
