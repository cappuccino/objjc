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

// warnings for UnknownType and AnotherUnknownType
- (UnknownType)unknownType:(AnotherUnknownType)type another:(KnownType)another
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
