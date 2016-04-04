@implementation Empty
@end

@implementation Empty (Category)
@end

@implementation Subclass : Empty
@end

@protocol Protocol1
@end

@protocol Protocol2
@end

@implementation OneProtocol <Protocol1>
@end

@implementation TwoProtocols <Protocol1, Protocol2>
@end

@implementation EmptyIvars
{}
@end

@implementation Ivars
{
    int one;
    Empty two;
    @outlet id outlet;
    IBOutlet id outlet2;
}
@end

@implementation Statements

var x = 7;

function test()
{
    doSomething();
}

@end

@implementation Methods

var initialized = false,
    initCount = 0;

+ (void)initialize
{
    initialized = true;
}

- (id)init
{
    self = [super init];

    if (self)
        initCount++;

    return self;
}

@end
