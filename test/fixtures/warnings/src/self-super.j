// 'self' used outside of a method or function
[self doSomething];

// 'super' used outside of a method or function
[super doSomething];

// These are okay, in a function
function initMe()
{
    self = [super init];

    if (self)
        [self initMe];

    return self;
}

// No warnings for super, not a root class
@implementation CPObject
@end

@implementation Okay : CPObject

+ (void)initialize
{
    [super initialize];
    [self classInit];
}

+ (void)classInit
{
}

- (id)init
{
    return [super init];
}

@end


@implementation Root

+ (void)initialize
{
    // 'Root' cannot use 'super' because it is a root class
    [super initialize];
    [self classInit];
}

+ (void)classInit
{
}

- (id)init
{
    // 'Root' cannot use 'super' because it is a root class
    return [super init];
}

@end
