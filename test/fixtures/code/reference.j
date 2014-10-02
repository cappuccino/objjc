
@implementation Reference

- (void)mungeRef:(intRef)ref
{
    var i = ++@deref(ref);
    i = @deref(ref)++;
    @deref(ref) += 1;
}

- (void)test
{
    var i = 13;

    [self mungeRef:@ref(i)];
}

@end
