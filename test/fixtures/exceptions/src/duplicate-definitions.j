@implementation First
@end

// duplicate definition of class
@implementation First
@end

@implementation First (Category)
@end

// duplicate definition of category
@implementation First (Category)
@end

// duplicate class definition is ignored
@class First

@class Before, Second

// @class definition is unnecessary
@implementation Second
@end

// duplicate definition is ignored
@class Third, Second

// duplicate definition is ignored
@class Fourth, Third

@protocol Protocol
@end

// duplicate definition is ignored
@protocol Protocol
@end

@typedef colorScheme

// duplicate definition is ignored
@typedef something, colorScheme

@global Foo, Bar

// duplicate definition is ignored
@global Bar

SomeGlobal = 7;

// duplicate definition is ignored
@global SomeGlobal
