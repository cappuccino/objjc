@protocol One

// implicitly required
- (void)required1;
+ (void)classRequired1;

@required
- (void)required2;
- (void)required3;
+ (void)classRequired2;

@optional
- (void)optional1;
- (void)optional2;
- (void)classOptional1;

@end

@protocol Two <One>

@required
- (void)required4;
+ (void)classRequired3;

@optional
- (void)optional3;
+ (void)classRequired4;

@end

@protocol Three

// implicitly required
- (void)required5;
+ (void)classRequired5;

@optional
- (void)optional4;

@end


// required1/2/4/5 unimplemented
// classequired2/3/5 unimplemented
@implementation Class <Two, Three>

+ (void)classRequired1
{
}

+ (void)classRequired4
{
}

- (void)required3
{
}

- (void)optional2
{
}

@end
