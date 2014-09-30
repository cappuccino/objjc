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
            munge(self.x);
        }
        catch (ex)
        {
            console.log(ex.message);
        }

        console.log(ex);
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Test

function munge(x)
{
    return x + 1;
}
