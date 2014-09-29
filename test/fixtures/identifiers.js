FOO = 7;
Date = null;

var bar = 13;

// @global baz
// @class HaveALittleClass
// @class CPTextField

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
        var DEBUG = true,
            FOO = 13,
            bar = 27,
            baz = "test",
            HaveALittleClass,
            Test,
            local = true;

        if (local)
            console.log("local");

        glob = "this should warn";
        glob = "this should not warn";

        try
        {
            munge(self.x);
        }
        catch (ex)
        {
            console.log(ex.message);
        }

        console.log(ex);
        debugger;

        var label = ((___r1 = CPTextField.isa.objj_msgSend0(CPTextField, "alloc")), ___r1 === null ? null : ___r1.isa.objj_msgSend1(___r1, "initWithFrame:", CGRectMakeZero())),
            delegate = self.isa.objj_msgSend0(self, "delegate"),
            text = (CPTextfield == null ? null : CPTextfield.isa.objj_msgSend1(CPTextfield, "labelWithTitle:", "Woo-hoo!"));        

        // Generated receiver temp variables
        var __r1;
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
        var FOO = 7,
            alert = "warning!",
            x = 13;

        window = null;
        onblur = null;
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Test

function munge(x)
{
    doh = "doh!";
}
