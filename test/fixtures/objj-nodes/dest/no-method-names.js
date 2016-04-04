// @implementation NoMethodNames
var $the_class = objj_allocateClassPair(Nil, "NoMethodNames");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[
    // -methodOne:
    new objj_method(sel_getUid("methodOne:"),
    function(self, _cmd, param)
    {
    },
    // argument types
    ["int", "id"]),
]);

// Class methods
class_addMethods($the_class.isa,
[
    // +initialize
    new objj_method(sel_getUid("initialize"),
    function(self, _cmd)
    {
    },
    // argument types
    ["void"]),
]);
// @end: @implementation NoMethodNames
