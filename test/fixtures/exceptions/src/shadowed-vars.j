var x = 7;

function implicitGlobal()
{
    // This generates an implicit global warning which is removed
    // when the scope closes because of the var declaration below.
    y = 7;

    // This does not generate a warning as it's legal in Javascript.
    // The implicit global y is converted to a local var by the compiler.
    var y;
}

@global someGlobal

// Hidden @global warning
var someGlobal = 27;

function hiddenFileVar()
{
    // Hidden file var warning
    var x = 13;
}

@global foo

function hiddenGlobal()
{
    // Hidden @global warning
    var foo = 7;
}

@class someClass

function hiddenClassStatement()
{
    // Hidden class warning
    var someClass = "oops!";
}

@implementation Test
@end

function hiddenImplementation()
{
    // Hidden class warning
    var Test = "hidden";
}

@protocol TestProtocol
@end

function hiddenProtocol()
{
    // Hidden protocol warning
    var TestProtocol = "hidden";
}

@typedef colorScheme

function hiddenGlobal()
{
    // Hidden typedef warning
    var colorScheme = null;
}

// Hidden predefined global
var window = null;

// No warning, this is defined to ignore shadowing
var location = "here";

function testParameters(one, two)
{
    // Local declaracion hides a function parameter
    var one = 7,
        two = 13;
}

@implementation TestMethodParameters

- (void)testMethodParameters:(int)first two:(int)second
{
    // Local declaration hides a method parameter
    var first = 7,
        second = 13;
}

@end

// Within an Objective-J method, 'self' and '_cmd' are implicit parameters,
// and should not be hidden by a local variable.

function outer()
{
    // Outside of a method, using 'self' or '_cmd' as a variable is legal
    var self = 7,
        _cmd = 13;
}

@implementation TestImplicit

- (void)test
{
    // errors
    var self = 7,
        _cmd = 13;

    function inner()
    {
        // errors
        var self = 27,
            _cmd = 31;
    }
}

@end
