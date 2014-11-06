FOO = 7;
GLOBAL = "global";
Date = null;  // assigning to a read-only predefined global

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
        x = deferredFileVar + DeferredGlobal;

    return self;
}

- (void)test
{
    var DEBUG = true,
        FOO = 13,  // local declaration of 'FOO' shadows a global variable
        bar = 27,  // local declaration of 'bar' shadows a file variable
        baz = "test",  // local declaration of 'baz' shadows a @global declaration
        HaveALittleClass,  // local declaration of 'HaveALittleClass' shadows a @class declaration
        Test,  // local declaration of 'Test' shadows a class
        local = true,
        outer = 7;

    if (local)
        console.log("local");
    else
        bar = boo;  // reference to unknown identifier 'boo'

    glob = "this should warn";  // implicitly creating a global variable
    glob = "this should not warn";

    try
    {
        munge(x);
    }
    catch(ex)
    {
        console.log(ex.message);
    }

    console.log(ex);  // reference to unknown identifier 'ex', out of scope
    debugger;  // debugger statement

    var label = [[CPTextField alloc] initWithFrame:CGRectMakeZero()],  // reference to unknown identifier 'CGRectMakeZero'
        delegate = [self delegate],
        text = [CPTextfield labelWithTitle:@"Woo-hoo!"];  // reference to unknown identifier 'CPTextfield'; did you mean 'CPTextField'?

    [self testWithCallback:function()
        {
            var foobar = 27,
                FOO = 7;  // local declaration of 'FOO' shadows a variable in a containing closure

            console.log(outer + foobar);  // make sure outer scope can be referenced
            setTimeout(function()
                {
                    var foobar = "foobar";  // local declaration of 'foobar' shadows a variable in a containing closure

                    console.log(foobar + FOO);
                },
                100);
        }
    ];

    console.log(foobar);  // reference to unknown identifier 'foobar', declared in inner scope
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

    var alert = "warning!",  // local declaration of 'alert' shadows a predefined global
        x = 13;

    window = null;  // assigning to a read-only predefined global
    onblur = null;  // no warning, it's assignable

    deferredLocal = "don't warn";  // declaration follows, should not warn

    var deferredLocal;
}

@end

function munge(x)
{
    doh = "doh!";  // implicitly creating a global variable
}

var deferredFileVar = "file var";

DeferredGlobal = "global";
