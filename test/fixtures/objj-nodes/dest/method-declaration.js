// @protocol Protocol1
var $the_protocol = objj_allocateProtocol("Protocol1");

objj_registerProtocol($the_protocol);

// @end: @protocol Protocol1

// @protocol Protocol2
var $the_protocol = objj_allocateProtocol("Protocol2");

objj_registerProtocol($the_protocol);

// @end: @protocol Protocol2

// @implementation Methods
var $the_class = objj_allocateClassPair(Nil, "Methods");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[
    // -defaultType
    new objj_method(sel_getUid("defaultType"),
    function $Methods__defaultType(self, _cmd)
    {
    },
    // argument types
    ["id"]),

    // -action1
    new objj_method(sel_getUid("action1"),
    function $Methods__action1(self, _cmd)
    {
    },
    // argument types
    ["void"]),

    // -action2
    new objj_method(sel_getUid("action2"),
    function $Methods__action2(self, _cmd)
    {
    },
    // argument types
    ["void"]),

    // -returnProtocols
    new objj_method(sel_getUid("returnProtocols"),
    function $Methods__returnProtocols(self, _cmd)
    {
    },
    // argument types
    ["id"]),

    // -selectorWith:
    new objj_method(sel_getUid("selectorWith:"),
    function $Methods__selectorWith_(self, _cmd, one)
    {
    },
    // argument types
    ["void", "int"]),

    // -selectorWith:two:
    new objj_method(sel_getUid("selectorWith:two:"),
    function $Methods__selectorWith_two_(self, _cmd, one, two)
    {
    },
    // argument types
    ["void", "int", "double"]),

    // -selectorWithProtocols:
    new objj_method(sel_getUid("selectorWithProtocols:"),
    function $Methods__selectorWithProtocols_(self, _cmd, protocols)
    {
    },
    // argument types
    ["void", "id"]),

    // -varArgs:
    new objj_method(sel_getUid("varArgs:"),
    function $Methods__varArgs_(self, _cmd, count)
    {
    },
    // argument types
    ["void", "int"]),
]);
// @end: @implementation Methods
