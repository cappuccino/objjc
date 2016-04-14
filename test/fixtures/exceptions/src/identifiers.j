// unknown identifier 'bar'
var foo = bar;

// unknown identifier 'CPString'
var str = [CPString stringWithFormat:@"%s cool", @"way"];

// unknown identifier 'CPApp', but it is declared later so there is no warning
[CPApp doSomething];

@class CPApp

@implementation Test

- (void)test
{
    var one = 7,
        two = 13; // Oops, this should have been a comma, the next three assignments create implicit globals
        three = 27,
        four = 31,
        x = @"foo";

    // At this point 'x' created an implicit global warning, but the var declaration will remove it.
    var x;

    // unknown identifier warning
    x = unknownVar;

    // This creates an unknown identifier warning, but the var declaration later removes it.
    one = deferredVar;

    var deferredVar;
}

@end

function test()
{
    // Even though the 'two' and 'three' assignments are made to known implicit globals from the 'test'
    // method above, we warn again because we assume they are mistaken implicit globals in this scope.

    var one = 7; // Oops, this should have been a comma, the next assignment warns about implicit global
        two = 1931;

    // This will not warn because 'two' is already an implicit global in this scope
    two = 2;

    // This will warn because 'four' is an implicit global in another scope
    four = "bar";
}
