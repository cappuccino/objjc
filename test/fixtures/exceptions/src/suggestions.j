@class CPString

// unknown identifier 'CPstring', did you mean 'CPString'?
var str = [CPstring stringWithFormat:@"%s cool", @"way"];

@protocol CPCopying
@end

@typedef ColorScheme

// unknown protocol, did you mean 'CPCopying'?
@implementation MyObject <CPcopying>

// unknown type, did you mean 'ColorScheme'?
- (Colorscheme)getSchemeWithName:(CPString)name
{
}

// unknown type, did you mean 'int'?
- (Int)count
{
}

// unknown type, did you mean 'MyObject'?
- (Myobject)copy:(MyObject)other
{
}

@end
