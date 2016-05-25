// @implementation CPApplication
var $the_class = objj_allocateClassPair(Nil, "CPApplication");
objj_registerClassPair($the_class);
// @end: @implementation CPApplication

// @implementation CPString
var $the_class = objj_allocateClassPair(Nil, "CPString");
objj_registerClassPair($the_class);
// @end: @implementation CPString

// @implementation CPTextField
var $the_class = objj_allocateClassPair(Nil, "CPTextField");
objj_registerClassPair($the_class);
// @end: @implementation CPTextField

// @class CPArray;

var fileVar = /* [[CPApplication sharedApplication] mainWindow] */ ((___r1 = (CPApplication.isa.method_msgSend["sharedApplication"] || _objj_forward)(CPApplication, "sharedApplication")), ___r1 == null ? null : (___r1.isa.method_msgSend["mainWindow"] || _objj_forward)(___r1, "mainWindow"));

// @implementation Super
var $the_class = objj_allocateClassPair(Nil, "Super");
objj_registerClassPair($the_class);
// @end: @implementation Super

// @implementation Test : Super
var $the_class = objj_allocateClassPair(Super, "Test");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[
    new objj_ivar("field", "CPTextField")
]);

// Instance methods
class_addMethods($the_class,
[
    // - (id)init
    new objj_method(sel_getUid("init"),
    function $Test__init(self, _cmd)
    {
        self = /* [super init] */ (objj_getClass("Test").super_class.method_dtable["init"] || _objj_forward)(self, "init");

        if (self)
            /* [self foo] */ (self == null ? null : (self.isa.method_msgSend["foo"] || _objj_forward)(self, "foo"));

        return self;
    },
    // argument types
    ["id"]),

    // - (void)foo
    new objj_method(sel_getUid("foo"),
    function $Test__foo(self, _cmd)
    {
        {
            var count = /* [[self subviews] count] */ ((___r1 = (self.isa.method_msgSend["subviews"] || _objj_forward)(self, "subviews")), ___r1 == null ? null : (___r1.isa.method_msgSend["count"] || _objj_forward)(___r1, "count"));
        }

        self.field = /* [[CPTextField alloc] init] */ ((___r1 = (CPTextField.isa.method_msgSend["alloc"] || _objj_forward)(CPTextField, "alloc")), ___r1 == null ? null : (___r1.isa.method_msgSend["init"] || _objj_forward)(___r1, "init"));
        /* [field setTitle:[CPString stringWithFormat:@"Count: %d", count]] */ ((___r1 = self.field), ___r1 == null ? null : (___r1.isa.method_msgSend["setTitle:"] || _objj_forward)(___r1, "setTitle:", (CPString.isa.method_msgSend["stringWithFormat:"] || _objj_forward)(CPString, "stringWithFormat:", "Count: %d", count)));

        // Generated receiver temp variables
        var ___r1;
    },
    // argument types
    ["void"]),

    // - (CPArray)subviews
    new objj_method(sel_getUid("subviews"),
    function $Test__subviews(self, _cmd)
    {
        return /* [[[[CPApplication sharedApplication] mainWindow] contentView] subviews] */ ((___r1 = ((___r2 = ((___r3 = (CPApplication.isa.method_msgSend["sharedApplication"] || _objj_forward)(CPApplication, "sharedApplication")), ___r3 == null ? null : (___r3.isa.method_msgSend["mainWindow"] || _objj_forward)(___r3, "mainWindow"))), ___r2 == null ? null : (___r2.isa.method_msgSend["contentView"] || _objj_forward)(___r2, "contentView"))), ___r1 == null ? null : (___r1.isa.method_msgSend["subviews"] || _objj_forward)(___r1, "subviews"));

        // Generated receiver temp variables
        var ___r1, ___r2, ___r3;
    },
    // argument types
    ["CPArray"]),

    // - (void)doSomething:withNumber:and:andAlso:
    new objj_method(sel_getUid("doSomething:withNumber:and:andAlso:"),
    function $Test__doSomething_withNumber_and_andAlso_(self, _cmd, something, number, and, also)
    {
        console.log(/* [CPString stringWithFormat:@"%s, %d, %s, %i", something, number, and, also] */ (CPString.isa.method_msgSend["stringWithFormat:"] || _objj_forward)(CPString, "stringWithFormat:", "%s, %d, %s, %i", something, number, and, also));
    },
    // argument types
    ["void", "CPString", "int", "CPString", "int"]),

    // - (void)bigSelector
    new objj_method(sel_getUid("bigSelector"),
    function $Test__bigSelector(self, _cmd)
    {
        /* [self doSomething:@"bold" withNumber:7 and:@"something else" andAlso:27] */ (self.isa.method_msgSend["doSomething:withNumber:and:andAlso:"] || _objj_forward)(self, "doSomething:withNumber:and:andAlso:", "bold", 7, "something else", 27);
    },
    // argument types
    ["void"])
]);

// Class methods
class_addMethods($the_class.isa,
[
    // + (void)initialize
    new objj_method(sel_getUid("initialize"),
    function $Test__initialize(self, _cmd)
    {
        /* [super initialize] */ (objj_getMetaClass("Test").super_class.method_dtable["initialize"] || _objj_forward)(self, "initialize");
        /* [self classInit] */ (self.isa.method_msgSend["classInit"] || _objj_forward)(self, "classInit");
    },
    // argument types
    ["void"]),

    // + (void)classInit
    new objj_method(sel_getUid("classInit"),
    function $Test__classInit(self, _cmd)
    {
    },
    // argument types
    ["void"])
]);
// @end: @implementation Test : Super

// Generated receiver temp variables
var ___r1;
