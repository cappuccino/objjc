@class CPString

@protocol Person
- (void)setFirstName:(CPString)first lastName:(CPString)last;
- (CPString)firstName;
- (CPString)lastName;
- (CPString)fullName;
// multiple declarations of method 'firstName' found and ignored
- (CPString)firstName;
@end

// duplicate definiton of protocol 'Person' is ignored
@protocol Person
@end

@protocol Parent
- (void)adopt:(Person)child;
- (CPArray)children;
@end

@protocol PersonWithChildren <Person, Parent>
@end

// method 'fullName' in protocol 'Person' not implemented
@implementation Somebody <Person>
- (void)setFirstName:(CPString)first lastName:(CPString)last {}
- (CPString)firstName {}
- (CPString)lastName {}
@end

// cannot find protocol declaration for 'Unknown'
// method 'adopt:' in protocol 'Parent' not implemented
// method 'children' in protocol 'Parent' not implemented
@implementation SomeParent <Person, Parent, Unknown>
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

// only the superclass warns about missing protocol methods
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

// cannot find protocol declaration for 'Unknown'
- (void)setSomething:(id<Unknown>)something
{
}

@end
