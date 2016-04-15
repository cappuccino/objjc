@implementation Test
{
    // setter cannot be specified for a readonly ivar
    int one @accessors(readonly, setter=setMe);
    double two @accessors(readonly);
    BOOL three;
    id four @accessors;
}

// setter method cannot be specified for a readonly ivar
- (void)setTwo:(double)newValue
{
}

// ivar has no accessors, no problem
- (void)setThree:(BOOL)newValue
{
}

// ivar is not readonly, no problem
- (void)setFour:(id)newValue
{
}

// Not a potential setter method
- (double)getTwo
{
}

// Not a potential setter method
- (void)setTwo
{
}

// Doesn't match any ivars
- (void)setToo:(double)newValue
{
}

// Class method is not checked
+ (void)setTwo:(double)newValue
{
}

@end

@protocol Protocol

// Protocol methods are not checked, they have no ivars
- (void)setTwo:(double)newValue;

@end
