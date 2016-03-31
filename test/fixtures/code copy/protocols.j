"foo"
@class CPArray, CPString
@protocol Person
- (void)setFirstName:(CPString)first lastName:(CPString)last;
- (CPString)firstName;
- (CPString)lastName;
- (CPString)fullName;
@end

// duplicate definition of protocol 'Person' is ignored
@protocol Person
@end

@protocol Parent
- (void)adopt:(Person)child;
- (CPArray)children;
@end
"foobar"
@protocol PersonWithChildren < Person, Parent >
@end
// method 'fullName' in protocol 'Person' not implemented
@implementation Somebody <Person>
- (void)setFirstName:(CPString)first lastName:(CPString)last {}
- (CPString)firstName {}
- (CPString)lastName {}
@end

// method 'firstName' in protocol 'Person' not implemented
// method 'adopt:' in protocol 'Parent' not implemented
// method 'children' in protocol 'Parent' not implemented
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
