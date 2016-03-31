@typedef ColorType
@typedef ViewType, DataSource

@implementation Test
{
    ColorType color;
    ViewType view;
    DataSource dataSource;
}

- (BOOL)hasColorOfType:(ColorType)type
{
    return type === color;
}

@end
