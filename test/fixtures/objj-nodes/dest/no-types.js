// @implementation NoTypes
var $the_class = objj_allocateClassPair(Nil, "NoTypes");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("one"),    
    new objj_ivar("two"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -methodOne:
    new objj_method(sel_getUid("methodOne:"),    
    function $NoTypes__methodOne_(self, _cmd, param)
    {
    }),
]);
// @end: @implementation NoTypes
