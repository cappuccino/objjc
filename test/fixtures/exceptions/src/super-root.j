@implementation Test

- (id)init
{
    // 'Test' cannot use 'super' because it is a root class
    return [super init];
}

@end

@implementation SubTest : Test

- (id)init
{
    // no warning, it isn't a root class
    return [super init];
}

@end
