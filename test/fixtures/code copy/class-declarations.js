// @class CPString;

var foo = 7;

// @protocol SomeProtocol
var $the_protocol = objj_allocateProtocol("SomeProtocol");
objj_registerProtocol($the_protocol);

// @end: @protocol SomeProtocol

// @implementation Foo
var $the_class = objj_allocateClassPair(Nil, "Foo");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("name", "CPString"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -test:
    new objj_method(sel_getUid("test:"),    
    function $Foo__test_(self, _cmd, arg)
    {
    },
    // argument types
    ["int", "id"]),
]);
// @end: @implementation Foo

"bar";

var BarCount = 0;

// @implementation Bar : Foo
var $the_class = objj_allocateClassPair(Foo, "Bar");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("firstName", "CPString"),    
    new objj_ivar("lastName", "CPString"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -fullName
    new objj_method(sel_getUid("fullName"),    
    function $Bar__fullName(self, _cmd)
    {
        return Bar.isa.objj_msgSend3(Bar, "stringWithFormat:", "%s %s", self.firstName, self.lastName);
    },
    // argument types
    ["CPString"]),
    
    // -addContactWithFirstName:lastName:
    new objj_method(sel_getUid("addContactWithFirstName:lastName:"),    
    function $Bar__addContactWithFirstName_lastName_(self, _cmd, first, last)
    {
        self.firstName = first;
        self.lastName = last;
        BarCount++;
    },
    // argument types
    ["CPString", "CPString", "CPString"]),
    
    // -test:
    new objj_method(sel_getUid("test:"),    
    function $Bar__test_(self, _cmd, arg)
    {
    },
    // argument types
    ["int", "id"]),
]);

// Class methods
class_addMethods($the_class.isa,
[    
    // +contactCount
    new objj_method(sel_getUid("contactCount"),    
    function $Bar__contactCount(self, _cmd)
    {
        return BarCount;
    },
    // argument types
    ["int"]),
    
    // +stringWithFormat:
    new objj_method(sel_getUid("stringWithFormat:"),    
    function $Bar__stringWithFormat_(self, _cmd, format)
    {
    },
    // argument types
    ["id", "CPString"]),
]);
// @end: @implementation Bar : Foo

// @implementation Foo (Category)
var $the_class = objj_getClass("Foo");

if (!$the_class)
    throw new ReferenceError("Cannot find declaration for class 'Foo'");

// @end: @implementation Foo (Category)

"foobar";
