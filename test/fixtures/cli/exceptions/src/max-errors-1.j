// 1st error
@implementation Foo : Bar
@end

// 2nd error, compilation aborted
@implementation One : Two
@end

// This code is not compiled, no error
@implementation One : Two
@end
