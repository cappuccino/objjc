@implementation Test
{
    int x;
}

- (void)test
{
try { munge(x); } catch(ex) { console.log(ex.message); }
console.log(ex);  // This should generate a warning, ex is out of scope
}

@end

function munge(x) { return x + 1; }
