@protocol One

// implicitly required
- (void)oneRequired1;
+ (void)oneClassRequired1;

@required
- (void)oneRequired2;
- (void)oneRequired3;
- (void)override;
+ (void)oneClassRequired2;

@optional
- (void)oneOptional1;
- (void)oneOptional2;
- (void)oneClassOptional1;

@end

@protocol Two <One>

@required
- (void)twoRequired1;
- (int)override;
+ (void)twoClassRequired1;

@optional
- (void)twoOptional1;
+ (void)twoClassOptional1;

@end

@protocol Three

// implicitly required
- (void)threeRequired1;
+ (void)threeClassRequired1;

@optional
- (void)threeOptional1;

@end

// Warnings:
// oneRequired1, oneRequired2, oneClassRequired2, override
// twoRequired1, twoClassRequired1, override
// threeRequired1
@implementation Class1 <Two, Three>

+ (void)oneClassRequired1
{
}

+ (void)threeClassRequired1
{
}

- (void)oneRequired3
{
}

- (void)oneOptional2
{
}

@end

// Protocol conformance is assumed in inherited classes,
// so there should be no warnings for this class.
@implementation Class2 : Class1
@end

// Warnings:
// oneRequired3, oneClassRequired2, override
@implementation Class3 <One>

- (void)oneRequired1
{
}

+ (void)oneClassRequired1
{
}

- (void)oneRequired2
{
}

@end

// <Two> adopts <One>, but because protocol conformance is assumed in inherited classes,
// and Class3 adopts <One>, this class will only warn about methods from <Two> itself,
// override and twoClassRequired1.
@implementation Class4: Class3 <Two>

- (void)override
{
}

@end
