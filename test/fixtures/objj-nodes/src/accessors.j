@implementation Accessors
{
    int accessors @accessors;
    int copyMe @accessors(copy);
    int readOnly @accessors(readonly);
    int propertyAccessors @accessors(property=property);
    int getter @accessors(getter=getMe);
    int setter @accessors(setter=setMe);
    int getterSetter @accessors(getter=getMe, setter=setIt);
    int hasGetter @accessors;
    int hasSetter @accessors;
    int _underscore @accessors; // _ is stripped from accessor names
}

- (int)hasGetter
{
    return self.hasGetter;
}

- (void)setHasSetter:(int)newValue
{
    self.hasSetter = newValue;
}

@end
