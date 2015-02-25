@class CPString

// cannot find implementation declaration for 'Bar', superclass of 'Foo'
@implementation Foo : Bar
{
    CPString firstName;

    int goodProperty @accessors(readonly);

    // setter cannot be specified for a readonly property
    int badProperty @accessors(setter=setBad, readonly);
}

-(void)test:(int)arg
{
    console.log(arg);
}

// duplicate definition of method 'test:'
-(void)test:(int)arg
{
    console.log(arg);
}

@end


@implementation Bar : Foo
{
    // redeclaration of instance variable 'firstName' in class 'Bar'
    CPString firstName;
}

// conflicting return type in implementation of 'test:': 'void' vs 'int'
// conflicting parameter type in implementation of 'test:': 'int' vs 'float'
- (int)test:(float)arg
{
}

@end

// duplicate definition of class 'Bar'
@implementation Bar
@end
