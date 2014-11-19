@implementation Test

- (void)test
{
    @deref([self someRef]) += 7;
}

@end
