// @implementation Test
var $the_class = objj_allocateClassPair(Nil, "Test");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("x", "int"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -test
    new objj_method(sel_getUid("test"),    
    function $Test__test(self, _cmd)
    {
        try
        {
            self.isa.objj_msgSend0(self, "fail");
        }
        catch (ex)
        {
            console.log(ex.message);
        }
    },
    // argument types
    ["void"]),
    
    // -fail
    new objj_method(sel_getUid("fail"),    
    function $Test__fail(self, _cmd)
    {
        throw Error("oops");
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Test
