// @implementation Foo
var $the_class = objj_allocateClassPair(Nil, "Foo");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("bar", "int"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -test:me:
    new objj_method(sel_getUid("test:me:"),    
    function $Foo__test_me_(self, _cmd, foo, bar)
    {
    },
    // argument types
    ["id", "int", "id"]),
]);
// @end: @implementation Foo

// @implementation Bar : Foo
var $the_class = objj_allocateClassPair(Foo, "Bar");
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[    
    // -test:me:
    new objj_method(sel_getUid("test:me:"),    
    function $Bar__test_me_(self, _cmd, foo, bar)
    {
    },
    // argument types
    ["CPObject", "BOOL", "CPString"]),
]);
// @end: @implementation Bar : Foo
