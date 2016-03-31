@implementation CPApplication
@end

@implementation CPString
@end

@implementation CPTextField
@end

@class CPArray

var fileVar = [[CPApplication sharedApplication] mainWindow];

@implementation Super
@end

@implementation Test : Super
{
    CPTextField field;
}

+ (void)initialize
{
    [super initialize];
    [self classInit];
}

+ (void)classInit
{
}

- (id)init
{
    self = [super init];

    if (self)
        [self foo];

    return self;
}

- (void)foo
{
    // Make sure temp vars are *not* put in this block
    {
        var count = [[self subviews] count];
    }

    field = [[CPTextField alloc] init];
    [field setTitle:[CPString stringWithFormat:@"Count: %d", count]];
}

- (CPArray)subviews
{
    return [[[[CPApplication sharedApplication] mainWindow] contentView] subviews];
}

- (void)doSomething:(CPString)something withNumber:(int)number and:(CPString)and andAlso:(int)also
{
    console.log([CPString stringWithFormat:@"%s, %d, %s, %i", something, number, and, also]);
}

- (void)bigSelector
{
    [self doSomething:@"bold" withNumber:7 and:@"something else" andAlso:27];
}

@end
