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

var fileVar = ((___r1 = CPApplication.isa.objj_msgSend0(CPApplication, "sharedApplication")), ___r1 == null ? null : ___r1.isa.objj_msgSend0(___r1, "mainWindow"));

// @implementation Super
var $the_class = objj_allocateClassPair(Nil, "Super");
objj_registerClassPair($the_class);
// @end: @implementation Super

// @implementation Test : Super
var $the_class = objj_allocateClassPair(Super, "Test");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("field", "CPTextField"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -init
    new objj_method(sel_getUid("init"),    
    function $Test__init(self, _cmd)
    {
        self = objj_msgSendSuper0({ receiver: self, super_class: objj_getClass("Test").super_class }, "init");

        if (self)
            (self == null ? null : self.isa.objj_msgSend0(self, "foo"));

        return self;
    },
    // argument types
    ["id"]),
    
    // -foo
    new objj_method(sel_getUid("foo"),    
    function $Test__foo(self, _cmd)
    {
        {
            var count = ((___r1 = self.isa.objj_msgSend0(self, "subviews")), ___r1 == null ? null : ___r1.isa.objj_msgSend0(___r1, "count"));
        }

        self.field = ((___r1 = CPTextField.isa.objj_msgSend0(CPTextField, "alloc")), ___r1 == null ? null : ___r1.isa.objj_msgSend0(___r1, "init"));
        ((___r1 = self.field), ___r1 == null ? null : ___r1.isa.objj_msgSend1(___r1, "setTitle:", CPString.isa.objj_msgSend2(CPString, "stringWithFormat:", "Count: %d", count)));        

        // Generated receiver temp variables
        var ___r1;
    },
    // argument types
    ["void"]),
    
    // -subviews
    new objj_method(sel_getUid("subviews"),    
    function $Test__subviews(self, _cmd)
    {
        return ((___r1 = ((___r2 = ((___r3 = CPApplication.isa.objj_msgSend0(CPApplication, "sharedApplication")), ___r3 == null ? null : ___r3.isa.objj_msgSend0(___r3, "mainWindow"))), ___r2 == null ? null : ___r2.isa.objj_msgSend0(___r2, "contentView"))), ___r1 == null ? null : ___r1.isa.objj_msgSend0(___r1, "subviews"));        

        // Generated receiver temp variables
        var ___r1, ___r2, ___r3;
    },
    // argument types
    ["void"]),
]);

// Class methods
class_addMethods($the_class.isa,
[    
    // +initialize
    new objj_method(sel_getUid("initialize"),    
    function $Test__initialize(self, _cmd)
    {
        objj_msgSendSuper0({ receiver: self, super_class: objj_getMetaClass("Test").super_class }, "initialize");
        self.isa.objj_msgSend0(self, "classInit");
    },
    // argument types
    ["void"]),
    
    // +classInit
    new objj_method(sel_getUid("classInit"),    
    function $Test__classInit(self, _cmd)
    {
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Test : Super

// Generated receiver temp variables
var ___r1;
