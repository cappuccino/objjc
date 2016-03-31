@protocol Parent

- (void)one;
- (int)two;
+ (void)classMethod;

@end

@protocol Child <Parent>

- (float)three;

@required
- (id)required;

@optional
- (void)optional

@end
