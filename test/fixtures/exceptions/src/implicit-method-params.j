// Within an Objective-J method, 'self' and '_cmd' are implicit parameters,
// and should not be hidden by a local variable.

function outer()
{
    // Outside of a method, using 'self' or '_cmd' as a variable is legal
    var self = 7,
        _cmd = 13;
}

@implementation Test

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
