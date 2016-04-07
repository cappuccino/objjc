@implementation One

- (void)one
{
}

- (void)two
{
}

// duplicate method error
- (void)one
{
}

// instance and class methods can have the same name
+ (void)one
{
}

// duplicate method error
+ (void)one
{
}

@end

@protocol ProtocolOne

- (void)one;
- (void)two;

// duplicate ignored warning
- (void)one;

// duplicate ignored warning
- (void)one;

+ (void)class1;

// duplicate ignored warning
+ (void)class1;

@end
