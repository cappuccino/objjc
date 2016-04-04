// @implementation Accessors
var $the_class = objj_allocateClassPair(Nil, "Accessors");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[
    new objj_ivar("copyMe", "int")
]);

// Instance methods
class_addMethods($the_class,
[
    // copyMe @accessors(copy) [getter]
    // - (int)copyMe
    new objj_method(sel_getUid("copyMe"),
    function $Accessors__copyMe(self, _cmd)
    {
        return self.copyMe;
    },
    // argument types
    ["int"]),

    // copyMe @accessors(copy) [setter]
    // - (void)setCopyMe:(int)newValue
    new objj_method(sel_getUid("setCopyMe:"),
    function $Accessors__setCopyMe_(self, _cmd, newValue)
    {
        if (self.copyMe !== newValue)
            /* copyMe = [newValue copy] */ self.copyMe = newValue == null ? null : (newValue.isa.method_msgSend["setCopyMe:"] || _objj_forward)(newValue, "copy");
    },
    // argument types
    ["void", "int"])
]);
// @end: @implementation Accessors
