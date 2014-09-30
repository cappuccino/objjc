// @class CPApplication
// @class CPString
// @class CPTextField

var fileVar = ((___r1 = (CPApplication == null ? null : CPApplication.isa.objj_msgSend0(CPApplication, "sharedApplication"))), ___r1 === null ? null : ___r1.isa.objj_msgSend0(___r1, "mainWindow"));

// @implementation Test
var $the_class = objj_allocateClassPair(Nil, "Test");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[    
    // -foo
    new objj_method(sel_getUid("foo"),    
    function $Test__foo(self, _cmd)
    {
        var field = ((___r1 = ((___r1 = CPTextField.isa.objj_msgSend0(CPTextField, "alloc")), ___r1 === null ? null : ___r1.isa.objj_msgSend0(___r1, "init"))), ___r1 === null ? null : ___r1.isa.objj_msgSend1(___r1, "setTitle:", CPString.isa.objj_msgSend2(CPString, "stringWithFormat:", "Count: %d", ((___r2 = self.isa.objj_msgSend0(self, "subviews")), ___r2 === null ? null : ___r2.isa.objj_msgSend0(___r2, "count")))));        

        // Generated receiver temp variables
        var __r1, __r2;
    },
    // argument types
    ["void"]),
    
    // -subviews
    new objj_method(sel_getUid("subviews"),    
    function $Test__subviews(self, _cmd)
    {
        return ((___r1 = ((___r1 = ((___r1 = CPApplication.isa.objj_msgSend0(CPApplication, "sharedApplication")), ___r1 === null ? null : ___r1.isa.objj_msgSend0(___r1, "mainWindow"))), ___r1 === null ? null : ___r1.isa.objj_msgSend0(___r1, "contentView"))), ___r1 === null ? null : ___r1.isa.objj_msgSend0(___r1, "subviews"));        

        // Generated receiver temp variables
        var __r1;
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Test

// Generated receiver temp variables
var __r1;
