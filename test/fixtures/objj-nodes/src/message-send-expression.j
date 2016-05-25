@implementation CPApplication
@end

@implementation CPString
@end

@implementation CPTextField
@end

@class CPArray

var fileVar = [
    [CPApplication sharedApplication]
    mainWindow
];

@implementation Super

- (void)manyArgs:(int)one two:(int)two three:(int)three four:(int)four
{
}

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
    [field setTitle:
        [CPString stringWithFormat:@"Count: %d", count]];
}

- (CPArray)subviews
{
    // We're using funky indentation here to test source map generation
    return [[[
        [CPApplication sharedApplication]
            mainWindow]
                contentView]
                    subviews];
}

- (void)doSomething:(CPString)something withNumber:(int)number and:(CPString)and andAlso:(int)also
{
    console.log([CPString stringWithFormat:@"%s, %d, %s, %i", something, number, and, also]);
}

- (void)bigSelector
{
    [self doSomething:@"bold"
           withNumber:7
                  and:@"something else"
              andAlso:27];
    [super manyArgs:1
                two:2
              three:3
               four:4];
}

- (void)emptySelector:(int)one :(double)two :(CPArray)three
{
}

- (void)testEmptySelector
{
    [self emptySelector:1 :2 :[3]];
}

@end
