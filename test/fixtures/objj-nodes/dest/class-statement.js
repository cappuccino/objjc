// @class Foo;
// @class Bar, Foobar;

// @implementation Test
var $the_class = objj_allocateClassPair(Nil, "Test");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[
    new objj_ivar("foo", "Foo"),
    new objj_ivar("bar", "Bar"),
    new objj_ivar("foobar", "Foobar")
]);
// @end: @implementation Test

// @implementation Foo
var $the_class = objj_allocateClassPair(Nil, "Foo");
objj_registerClassPair($the_class);
// @end: @implementation Foo

;
