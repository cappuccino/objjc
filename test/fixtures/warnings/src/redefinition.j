@global foo

// This should be ignored
@global foo

// 'foo' previously defined as a global
@class foo

@implementation foo
@end

@protocol foo
@end

@typedef foo

// This will not warn
foo = "good";


Global = "global";

// ignored
@global Global

// 'Global' previously defined as a global
@class Global

@implementation Global
@end

@protocol Global
@end

@typedef Global


// 'window' previously defined as a predefined global
@global window
@class window

@implementation window
@end

@protocol window
@end

@typedef window


@class SomeClass

// doesn't warn
@implementation SomeClass
@end

// ignored
@class SomeClass

// 'SomeClass' previously defined as a class
@global SomeClass

SomeClass = "foo";

@protocol SomeClass
@end

@typedef SomeClass


@implementation AnotherClass
@end

// doesn't warn
@class AnotherClass

// 'AnotherClass' previously defined as a class
@global AnotherClass

AnotherClass = "foo";

@protocol AnotherClass
@end

@typedef AnotherClass


@protocol Protocol
@end

// 'Protocol' previously defined as a protocol
@global Protocol

@class Protocol

@implementation Protocol
@end

@typedef Protocol

Protocol = "protocol";
