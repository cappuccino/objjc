@protocol Protocol1
@end

@protocol Protocol2
@end

@implementation Methods

// Return type defaults to id if not present
- defaultType
{
}

// @action/IBAction return type becomes void in generated code
- (@action)action1
{
}

- (IBAction)action2
{
}

// Return type can have protocols
- (id<Protocol1, Protocol2>)returnProtocols
{
}

- (void)selectorWith:(int)one
{
    // eval within a method marks self as mutated
    eval("doSomething()");
}

- (void)selectorWith:(int)one two:(double)two
{
}

- (void)selectorWithProtocols:(id<Protocol1, Protocol2>)protocols
{
}

- (void)varArgs:(int)count, ...
{
}

@end
