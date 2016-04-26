// @implementation Test
var $the_class = objj_allocateClassPair(Nil, "Test");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[
    // -one:
    new objj_method(sel_getUid("one:"),
    function $Test__one_(self, _cmd, two)
    {
    })
]);
// @end: @implementation Test

