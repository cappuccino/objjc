@class CPApplication
@class CPString
@class CPTextField

var fileVar = [[CPApplication sharedApplication] mainWindow];

@implementation Test

- (void)foo
{
    var field = [[[CPTextField alloc] init] setTitle:[CPString stringWithFormat:@"Count: %d", [[self subviews] count]]];
}

- (void)subviews
{
    return [[[[CPApplication sharedApplication] mainWindow] contentView] subviews];
}

@end
