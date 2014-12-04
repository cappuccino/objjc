@global foo

// This should be ignored
@global foo

// 'foo' previously defined as a global
@class foo

// 'foo' previously defined as a global
@implementation foo
@end

// 'foo' previously defined as a global
@protocol foo
@end

// This will not warn
foo = "good";


Global = "global";

// ignored
@global Global

// 'Global' previously defined as a global
@class Global

// 'Global' previously defined as a global
@implementation Global
@end

// 'Global' previously defined as a global
@protocol Global
@end


@class Foo

@implementation FooBar
@end

// ignored
@class Foo

// 'Foo' previously defined as a class
@global Foo

// 'FooBar' previously defined as a class
@global FooBar

// 'Foo' previously defined as a class
Foo = "foo";

// 'FooBar' previously defined as a class
FooBar = "foo";

// 'FooBar' previously defined as a class
@protocol FooBar
@end


@protocol Protocol
@end

// 'Protocol' previously defined as a protocol
@global Protocol

// 'Protocol' previously defined as a protocol
@class Protocol

// 'Protocol' previously defined as a protocol
@implementation Protocol
@end

// 'Protocol' previously defined as a protocol
Protocol = "protocol";
