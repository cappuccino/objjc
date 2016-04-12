
@implementation Reference

- (void)mungeRef:(@ref<int>)ref
{
    var i = ++@deref(ref);

    i = @deref(ref)++;
    i = --@deref(ref);
    i = @deref(ref)--;
    @deref(ref) = 27;
    @deref(ref) += 4;
    @deref(ref) = @deref(ref) - 4;
}

- (void)test
{
    var i = 13;

    [self mungeRef:@ref(i)];
}

@end
