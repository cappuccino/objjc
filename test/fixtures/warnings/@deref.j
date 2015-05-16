@implementation Test

- (void)test
{
    // references cannot have side effects
    @deref([self someRef]) += 7;
}

@end
