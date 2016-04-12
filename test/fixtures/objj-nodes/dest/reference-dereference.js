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
        var i = /* ++@deref(ref) */ (ref)(ref() + 1);

        i = /* @deref(ref)++ */ ((ref)(ref() + 1) - 1);
        i = /* --@deref(ref) */ (ref)(ref() - 1);
        i = /* @deref(ref)-- */ ((ref)(ref() - 1) + 1);
        /* @deref(ref) = 27 */ (ref)(27);
        /* @deref(ref) += 4 */ (ref)(ref() + 4);
        /* @deref(ref) = @deref(ref) - 4 */ (ref)(ref() - 4);
    },
    // argument types
    ["void", "@ref"]),

    // -test
    new objj_method(sel_getUid("test"),
    function $Reference__test(self, _cmd)
    {
        var i = 13;

        /* [self mungeRef:@ref(i)] */ self.isa.objj_msgSend1(self, "mungeRef:", /* @ref(i) */ function $at_ref(__value) { return arguments.length ? i = __value : i; });
    },
    // argument types
    ["void"])
]);
// @end: @implementation Reference
