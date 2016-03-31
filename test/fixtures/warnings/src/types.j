@global nil
@typedef CPInteger

@implementation CPObject
@end

@class CPView

@implementation TestClass
{
    void v;
    id object;
    SEL selector;
    JSObject js;

    char c;
    signed char sc;
    unsigned char usc;

    byte b;
    signed byte sb;
    unsigned byte usb;

    short s;
    signed short ss;
    unsigned short uss;

    int i;
    signed int si;
    unsigned int usi;

    long int li;
    signed long int sli;
    unsigned long int usli;

    long long ll;
    signed long long sll;
    unsigned long long usll;

    CPInteger cpi;
    CPUInteger cpui;

    CPObject obj;
    CPTextField field;
}

- (CPTextField)bad:(CPUInteger)arg moreBad:(CPView)view
{
    return nil;
}

- (CPView)good:(CPObject)object
{
}

@end

@protocol TestProtocol

- (BadReturnType)bad:(BadArgType)arg moreBad:(CPView)view;
- (void)good:(CPObject)object;

@end
