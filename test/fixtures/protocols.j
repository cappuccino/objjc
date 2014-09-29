"foo"
@protocol Person
- (void)setFirstName:(CPString)first lastName:(CPString)last;
- (CPString)firstName;
- (CPString)lastName;
- (CPString)fullName;
@end

@protocol Parent
- (void)adopt:(Person)child;
- (CPArray)children;
@end
"foobar"
@protocol PersonWithChildren < Person, Parent >
@end
@implementation Somebody <Person>
- (void)setFirstName:(CPString)first lastName:(CPString)last {}
- (CPString)firstName {}
- (CPString)lastName {}
@end

@implementation SomeParent <Person, Parent>
{
    CPString firstName;
    CPString lastName;
}

- (void)setFirstName:(CPString)first lastName:(CPString)last
{
    firstName = first;
    lastName = last;
}

- (CPString)firstName
{
    return firstName;
}

- (CPString)lastName
{
    return lastName;
}

- (CPString)fullName
{
    return firstName + " " + lastName;
}

@end

@implementation AnotherParent : SomeParent
{
    CPArray children;
    CPString firstName;
}

- (id)init
{
    self = [super init];

    if (self)
        children = [];

    return self;
}

- (void)adopt:(Person)child
{
    children.push(child);
}

- (CPArray)children
{
    return children;
}

@end
