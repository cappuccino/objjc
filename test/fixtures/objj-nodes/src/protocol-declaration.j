@protocol Person

- (void)eat;

@end

@protocol Parent

- (void)one;
- (int)two;
+ (void)classMethod;

@end

@protocol Child <Parent, Person>

- (float)three;

@required
- (id)required;

@optional
- (void)optional

@end

// It's legal to have a class with the same name as a protocol
@implementation Person <Person>

- (void)eat
{
    console.log("Yum!");
}

@end
