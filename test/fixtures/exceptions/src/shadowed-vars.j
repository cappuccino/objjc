var x = 7;

function hiddenFileVar()
{
    // local declaration hides file var
    var x = 13;
}

// function parameter hides file var
function hiddenFileVarParam(x)
{
}

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

// local declaration hides global
var someGlobal = 27;

@global foo
ActualGlobal = 31;

function hiddenGlobal()
{
    // local declaration hides global
    var foo = 7;

    // local declaration hides global
    var ActualGlobal = 31;
}

// function parameter hides global
function hiddenGlobalParam(foo, ActualGlobal)
{
}

@class someClass

function hiddenClassStatement()
{
    // local declaration hides class
    var someClass = "oops!";
}

// function parameter hides class
function hiddenClassStatementParam(someClass)
{
}

@implementation Test
@end

function hiddenImplementation()
{
    // local declaration hides class
    var Test = "hidden";
}

// function parameter hides class
function hiddenImplementationParam(Test)
{
}

@protocol TestProtocol
@end

function hiddenProtocol()
{
    // local declaration hides protocol
    var TestProtocol = "hidden";
}

// function parameter hides protocol
function hiddenProtocolParam(TestProtocol)
{
}

@typedef colorScheme, typedef

function hiddenTypedef()
{
    // local declaration hides typedef
    var colorScheme = null,
        typedef = "Homer";
}

// function parameter hides typedef
function hiddenTypedefParam(colorScheme)
{
}

// local declaration hides predefined global
var window = null;

// no warning, this predefined global is defined to ignore shadowing
var location = "here";

function testParameters(one, two)
{
    // local declaration hides a function parameter
    var one = 7,
        two = 13;
}

@implementation TestMethodParameters

- (void)testMethodParameters:(int)first two:(int)second
{
    // local declaration hides a method parameter
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
    // local declaration hides implicit method parameter
    var self = 7,
        _cmd = 13;

    function inner()
    {
        // local declaration hides implicit method parameter
        var self = 27,
            _cmd = 31;
    }
}

@end

@implementation IvarTest
{
    int one;
    int two;
}

- (void)test
{
    // local reference hides instance variable
    two = 13;
    two = 4 / 13/ 1964;

    // local declaration + reference hides instance variable
    var two = one + 27;

    // local declaration hides instance variable
    var one = 7;
}

// method parameter hides instance variable
- (int)test:(int)one and:(int)two
{
    // local reference hides instance variable
    return one + two;
}

// no warning, instance variables are not visible here
function bad(one, two)
{
    return one + two;
}

@end

@implementation TestHiddenTypes

- (void)testFileVar:(int)x
       actualGlobal:(int)ActualGlobal
    globalStatement:(int)foo
     classStatement:(int)someClass
   classDeclaration:(int)Test
           protocol:(int)TestProtocol
            typedef:(int)colorScheme
           typedef2:(int)typedef
           document:(int)document // ignores shadow, no warning
              event:(int)event
{
}

@end
