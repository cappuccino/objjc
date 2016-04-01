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
