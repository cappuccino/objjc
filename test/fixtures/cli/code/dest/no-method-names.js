// @implementation Test
var $the_class = objj_allocateClassPair(Nil, "Test");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[
    // - (void)one:
    new objj_method(sel_getUid("one:"),
    function(self, _cmd, two)
    {
    },
    // argument types
    ["void", "int"])
]);
// @end: @implementation Test

