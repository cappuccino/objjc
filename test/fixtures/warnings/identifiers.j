FOO = 7;
Date = null;

var bar = 13;
@global baz
@class HaveALittleClass
@class CPObject
@class CPTextField

@implementation Test : CPObject
{
    int x;
}

- (id)init
{
    self = [super init];

    if (self)
        x = 7;

    return self;
}

- (void)test
{
    var DEBUG = true,
    FOO = 13,
    bar = 27,
    baz = "test",
    HaveALittleClass,
    Test,
    local = true;

    if (local) console.log("local");
    glob = "this should warn";
    glob = "this should not warn";
    try { munge(x); } catch(ex) { console.log(ex.message); }
    console.log(ex);  // This should generate a warning, ex is out of scope
    debugger;
    var label = [[CPTextField alloc] initWithFrame:CGRectMakeZero()], delegate = [self delegate],
     text = [CPTextfield labelWithTitle:@"Woo-hoo!"];
}

+ (void)initialize
{
    if (self != [Test class])
        return;

    var FOO = 7,
        alert = "warning!",
        x = 13;

    window = null;  // read-only, warn
    onblur = null;  // no warning, it's assignable
}

@end

function munge(x) { doh = "doh!"; }
