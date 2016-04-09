// cannot find implementation for 'Bar'
@implementation Foo : Bar
@end

// cannot find protocol
@protocol One <Two, Three>
@end

// cannot find protocol
@implementation NoProtocol <One, Two, Three>

// cannot find protocol
- (id<One, Three>)one:(id<Two, Three>)protocol
{
}

// cannot find protocol
- (id<Two>)two:(id<One>)protocol
{
    // cannot find protocol
    var p = @protocol(Foo);
}

@end

// cannot find implementation
@implementation SomeClass (SomeCategory)
@end
