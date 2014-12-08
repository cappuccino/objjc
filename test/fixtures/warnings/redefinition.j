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

// 'foo' previously defined as a global
@typedef foo

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

// 'Global' previously defined as a global
@typedef Global


@class SomeClass

// doesn't warn
@implementation SomeClass
@end

// ignored
@class SomeClass

// 'SomeClass' previously defined as a class
@global SomeClass

// 'SomeClass' previously defined as a class
SomeClass = "foo";

// 'SomeClass' previously defined as a class
@protocol SomeClass
@end

// 'SomeClass' previously defined as a class
@typedef SomeClass


@implementation AnotherClass
@end

// doesn't warn
@class AnotherClass

// 'AnotherClass' previously defined as a class
@global AnotherClass

// 'AnotherClass' previously defined as a class
AnotherClass = "foo";

// 'AnotherClass' previously defined as a class
@protocol AnotherClass
@end

// 'AnotherClass' previously defined as a class
@typedef AnotherClass


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
@typedef Protocol

// 'Protocol' previously defined as a protocol
Protocol = "protocol";
