/*
    This is a test of source maps!
*/
@class CPString

var objj_allocateClassPair = empty,
    empty = function() {},
    objj_registerClassPair = empty,
    class_addIvars = empty,
    objj_ivar = empty,
    class_addMethods = empty,
    objj_method = empty,
    sel_getUid = empty,
    objj_getClass = function() { return {} },
    Foo,
    Superclass;

Nil = null;

var foo = 7;

@implementation Foo
{
    CPString name;
}

- (int)test:(float)arg
{
    console.log(arg);
}

@end

var BarCount = 0;

@implementation Bar : Foo
{
    CPString firstName;
    CPString lastName;
}

- (CPString)fullName
{
    return firstName + " " + lastName;
}

- (CPString)addContactWithFirstName:(CPString)first lastName:(CPString)last
{
    firstName = first;
    lastName = last;
    BarCount++;
}

- (void)test:(int)arg
{
    console.log(arg);
}

@end


@implementation FooBar (Foo)
@end

@class Superclass
@class AnotherClass

@implementation Subclass : Superclass
@end
