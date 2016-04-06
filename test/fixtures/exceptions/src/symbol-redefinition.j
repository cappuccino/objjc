//
// @class
//
@class Have, Some, Class

// 'Class' previously defined as a class
@global Class
@typedef One, Class

@protocol Class
@end

Class = "class";


//
// @global
//
@global Global

// 'Global' previously defined as a global
@class Global
@typedef Two, Global

@implementation Global
@end

@protocol Global
@end

// no error
Global = 7;

//
// @typedef
//
@typedef Foo, Typedef

// 'Typedef' previously defined as a typedef
@class Bar, Typedef
@global Typedef
Typedef = 7;

@implementation Typedef
@end

@protocol Typedef
@end


//
// global
//
SomeGlobal = 7;

// 'SomeGlobal' previously defined as a global
@class Something, SomeGlobal
@typedef SomeGlobal

@implementation SomeGlobal
@end

@protocol SomeGlobal
@end


//
// predefined global
//

// 'Node' is a predefined global
@class Node
@typedef Node

@implementation Node
@end

@protocol Node
@end


//
// @implementation
//
@implementation WooHoo
@end

// 'WooHoo' previously defined as a class
@global WooHoo
@typedef WooHoo

WooHoo = 7;

@protocol WooHoo
@end


//
// @protocol
//
@protocol Protocol
@end

// 'Protocol' previously defined as a protocol
@global Protocol
@typedef Protocol

Protocol = 7;

@implementation Protocol
@end
