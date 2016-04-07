// These uses are all OK

@implementation Superclass

- (id)init
{
    return self;
}

@end

@implementation Test : Superclass

- (id)init
{
    self = [super init];

    if (self)
    {
        [self doSomethingWith:[self getSomething]];
        [self useSelf:self];
    }

    return self;
}

- (void)useSelf:(id)_self
{
    [_self doSomethingWith:13];
}

- (void)doSomethingWith:(int)something
{
    function test()
    {
        var x = [self getSomething];
    }
}

- (int)getSomething
{
    return 7;
}

+ (void)classMethod:(int)someInt
{
}

@end

function selfParam(one, two, self)
{
    console.log(self);
}

function selfVar()
{
    var self = Test;

    return [self classMethod:7];
}

// These uses generate errors

// unknown identifier 'self'
[self doSomethingWith:self];

// unknown identifier 'self'
var x = self;

function test()
{
    // unknown identifier 'self'
    var me = self;

    // unknown identifier 'self'
    [self doSomething:[self somethingElse]];
}

@implementation Dumb

// 'self' used as a method parameter
- (void)test:(int)self
{
}

- (void)testFunction
{
    // 'self' used as a function parameter within a method
    function selfTest(one, two, self)
    {
    }
}

@end
