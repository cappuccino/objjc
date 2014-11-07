FOO = 7;
GLOBAL = "global";
// assigning to a read-only predefined global
Date = null;

var bar = 13;
@global baz
@global CPApp
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
        x = deferredFileVar + DeferredGlobal;

    return self;
}

- (void)test
{
    var DEBUG = true,
        // local declaration of 'FOO' shadows a global variable
        FOO = 13,
        // local declaration of 'bar' shadows a file variable
        bar = 27,
        // local declaration of 'baz' shadows a @global declaration
        baz = "test",
        // local declaration of 'HaveALittleClass' shadows a @class declaration
        HaveALittleClass,
        // local declaration of 'Test' shadows a class
        Test,
        local = true,
        outer = 7;

    if (local)
        console.log("local");
    else
        // reference to unknown identifier 'boo'
        bar = boo;

    // implicitly creating a global variable
    glob = "this should warn";
    glob = "this should not warn";

    try
    {
        munge(x);
    }
    catch(ex)
    {
        console.log(ex.message);
    }

    // reference to unknown identifier 'ex', out of scope
    console.log(ex);
    // debugger statement
    debugger;

    // reference to unknown identifier 'CGRectMakeZero'
    var label = [[CPTextField alloc] initWithFrame:CGRectMakeZero()],
        delegate = [self delegate],
        // reference to unknown identifier 'CPTextfield'; did you mean 'CPTextField'?
        text = [CPTextfield labelWithTitle:@"Woo-hoo!"],
        window = [CPApp mainWindow];

    [self testWithCallback:function()
        {
            var foobar = 27,
                // local declaration of 'FOO' shadows a variable in a containing closure
                FOO = 7;

            // make sure outer scope can be referenced
            console.log(outer + foobar);
            setTimeout(function()
                {
                    // local declaration of 'foobar' shadows a variable in a containing closure
                    var foobar = "foobar";

                    console.log(foobar + FOO);
                },
                100);
        }
    ];

    // reference to unknown identifier 'foobar', declared in inner scope
    console.log(foobar);
}

- (void)testWithCallback:(JSObject)callback
{
    GLOBAL = "this should not warn";
    callback();
}

+ (void)initialize
{
    if (self != [Test class])
        return;

    // local declaration of 'alert' shadows a predefined global
    var alert = "warning!",
        x = 13;

    // assigning to a read-only predefined global
    window = null;
    // no warning, it's assignable
    onblur = null;

    // declaration follows, should not warn
    deferredLocal = "don't warn";

    var deferredLocal;
}

@end

function munge(x)
{
    // implicitly creating a global variable
    doh = "doh!";
}

var deferredFileVar = "file var";

DeferredGlobal = "global";
