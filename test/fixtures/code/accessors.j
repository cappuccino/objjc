
@implementation Accessors
{
    CPString name @accessors;
    int age @accessors(readonly);
    CPString title @accessors(getter=getTheTitle);
    CPArray children @accessors(setter=adoptChildren);
    CPDate birthday @accessors(copy, getter=dob, setter=setDOB);

    BOOL single @accessors(property=isSingle);

    int _underscore @accessors(readonly);
}

@end

@implementation Getter
{
    CPString name @accessors;
}

- (void)setName:(CPString)newValue
{
    name = newValue;
}

- (CPString)name
{
    return name;
}

@end
