@class CPString
@typedef KnownType

@implementation One

+ (void)makeSomethingWith:(CPInteger)number
{
}

- (void)returnType
{
}

- (id)returnClass
{
}

- (id)returnPOD
{
}

- (void)parameterTypes:(int)one two:(double)two three:(CPString)three
{
}

- (id)thisIsOkay:(int)ok
{
}

// warnings for UnknownType and AnotherUnknownType
- (UnknownType)unknownType:(AnotherUnknownType)type another:(KnownType)another
{
}

// @action resolves to return type void
- (@action)test1
{
}

- (int)test2
{
}

// no return type resolves to id
- test3
{
}

- (int)test4
{
}

- (void)idVsClassParam:(id)one
{
}

- (void)idVsPODParam:(id)one
{
}

- (void)implicitIdParam1:(int)one
{
}

- (void)implicitIdParam2:one
{
}

@end

@implementation Two : One

// warnings for return type and parameter
+ (id)makeSomethingWith:(CPTimeInterval)number
{
}

// warning for return type
- (int)returnType
{
}

// no warning, concrete class can substitute for id
- (CPString)returnClass
{
}

// warning, POD type cannot be substituted for id
- (int)returnPOD
{
}

// warnings for all parameter types
- (void)parameterTypes:(CPString)one two:(int)two three:(double)three
{
}

// no warning, same types
- (id)thisIsOkay:(int)ok
{
}

// warning: void vs. int return type
- (int)test1
{
}

// warning: int vs. void return type
- (@action)test2
{
}

// warning: id vs. int return type
- (int)test3
{
}

// warning: int vs. id return type
- test4
{
}

// no warning, it's okay to use id in a superclass and a non-POD type in a subclass
- (void)idVsClassParam:(CPString)one
{
}

// warning: id vs. int
- (void)idVsPODParam:(int)one
{
}

// warning: int vs. id
- (void)implicitIdParam1:one
{
}

// warning: id vs. int
- (void)implicitIdParam2:(int)one
{
}

@end

// In Objective-J (as in Objective-C), subclass method overrides can legally redeclare
// the return and parameter types, which then apply to subclasses of the subclass.

@implementation Three : Two

// warning, because Two's override redeclared return type as int
- (id)returnPOD
{
}

// warnings for all parameter types, because Two's override redeclared them
- (void)parameterTypes:(int)one two:(double)two three:(CPString)three
{
}

@end

@protocol P1
- (void)one:(int)first;
@end

@protocol P2 <P1>
// warnings for all parameter types
- (int)one:(double)first;

@end

@protocol P3 <P2>
// warnings for all parameter types, because P2's override redeclared them
- (void)one:(int)first;
@end

@implementation Protocol <P3>

// warnings for all types
- (int)one:(double)first
{
}

@end
