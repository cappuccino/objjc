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
