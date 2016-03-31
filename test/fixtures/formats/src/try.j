@implementation Test
{
    int x;
}

- (void)test
{
try { [self fail]; } catch(ex) { console.log(ex.message); }
}

- (void)fail
{
    throw Error("oops");
}

@end
