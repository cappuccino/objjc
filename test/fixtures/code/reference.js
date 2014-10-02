// @implementation Reference
var $the_class = objj_allocateClassPair(Nil, "Reference");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[    
    // -mungeRef:
    new objj_method(sel_getUid("mungeRef:"),    
    function $Reference__mungeRef_(self, _cmd, ref)
    {
        var i = (ref)(ref() + 1);

        i = ((ref)(ref() + 1) - 1);
        i = (ref)(ref() - 1);
        i = ((ref)(ref() - 1) + 1);
        (ref)(ref() + 1);
    },
    // argument types
    ["void", "intRef"]),
    
    // -test
    new objj_method(sel_getUid("test"),    
    function $Reference__test(self, _cmd)
    {
        var i = 13;

        self.isa.objj_msgSend1(self, "mungeRef:", /* @ref(i) */ function $at_ref(__value) { return arguments.length ? i = __value : i; });
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Reference
