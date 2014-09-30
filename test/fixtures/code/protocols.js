"foo";

// @protocol Person
var $the_protocol = objj_allocateProtocol("Person");
objj_registerProtocol($the_protocol);
protocol_addMethodDescriptions($the_protocol,
[    
    // -setFirstName:lastName:
    new objj_method(sel_getUid("setFirstName:lastName:"), Nil,
    // argument types
    ["void", "CPString", "CPString"]),
    
    // -firstName
    new objj_method(sel_getUid("firstName"), Nil,
    // argument types
    ["CPString"]),
    
    // -lastName
    new objj_method(sel_getUid("lastName"), Nil,
    // argument types
    ["CPString"]),
    
    // -fullName
    new objj_method(sel_getUid("fullName"), Nil,
    // argument types
    ["CPString"]),
],
true, true);
// @end: @protocol Person

// @protocol Parent
var $the_protocol = objj_allocateProtocol("Parent");
objj_registerProtocol($the_protocol);
protocol_addMethodDescriptions($the_protocol,
[    
    // -adopt:
    new objj_method(sel_getUid("adopt:"), Nil,
    // argument types
    ["void", "Person"]),
    
    // -children
    new objj_method(sel_getUid("children"), Nil,
    // argument types
    ["CPArray"]),
],
true, true);
// @end: @protocol Parent

"foobar";

// @protocol PersonWithChildren <Person, Parent>
var $the_protocol = objj_allocateProtocol("PersonWithChildren");
objj_registerProtocol($the_protocol);

var $the_inherited_protocol = objj_getProtocol("Person");

if (!$the_inherited_protocol)
    throw new SyntaxError("Undefined protocol: Person");

protocol_addProtocol($the_protocol, $the_inherited_protocol);
$the_inherited_protocol = objj_getProtocol("Parent");

if (!$the_inherited_protocol)
    throw new SyntaxError("Undefined protocol: Parent");

protocol_addProtocol($the_protocol, $the_inherited_protocol);
// @end: @protocol PersonWithChildren <Person, Parent>

// @implementation Somebody <Person>
var $the_class = objj_allocateClassPair(Nil, "Somebody");
var $the_protocol = objj_getProtocol("Person");

if (!$the_protocol)
    throw new SyntaxError("Undefined protocol: Person);

class_addProtocol($the_class, $the_protocol);
objj_registerClassPair($the_class);

// Instance methods
class_addMethods($the_class,
[    
    // -setFirstName:lastName:
    new objj_method(sel_getUid("setFirstName:lastName:"),    
    function $Somebody__setFirstName_lastName_(self, _cmd, first, last)
    {
    },
    // argument types
    ["void", "CPString", "CPString"]),
    
    // -firstName
    new objj_method(sel_getUid("firstName"),    
    function $Somebody__firstName(self, _cmd)
    {
    },
    // argument types
    ["CPString"]),
    
    // -lastName
    new objj_method(sel_getUid("lastName"),    
    function $Somebody__lastName(self, _cmd)
    {
    },
    // argument types
    ["CPString"]),
]);
// @end: @implementation Somebody <Person>

// @implementation SomeParent <Person, Parent>
var $the_class = objj_allocateClassPair(Nil, "SomeParent");
var $the_protocol = objj_getProtocol("Person");

if (!$the_protocol)
    throw new SyntaxError("Undefined protocol: Person);

class_addProtocol($the_class, $the_protocol);
$the_protocol = objj_getProtocol("Parent");

if (!$the_protocol)
    throw new SyntaxError("Undefined protocol: Parent);

class_addProtocol($the_class, $the_protocol);
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("firstName", "CPString"),    
    new objj_ivar("lastName", "CPString"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -setFirstName:lastName:
    new objj_method(sel_getUid("setFirstName:lastName:"),    
    function $SomeParent__setFirstName_lastName_(self, _cmd, first, last)
    {
        self.firstName = first;
        self.lastName = last;
    },
    // argument types
    ["void", "CPString", "CPString"]),
    
    // -firstName
    new objj_method(sel_getUid("firstName"),    
    function $SomeParent__firstName(self, _cmd)
    {
        return self.firstName;
    },
    // argument types
    ["CPString"]),
    
    // -lastName
    new objj_method(sel_getUid("lastName"),    
    function $SomeParent__lastName(self, _cmd)
    {
        return self.lastName;
    },
    // argument types
    ["CPString"]),
    
    // -fullName
    new objj_method(sel_getUid("fullName"),    
    function $SomeParent__fullName(self, _cmd)
    {
        return self.firstName + " " + self.lastName;
    },
    // argument types
    ["CPString"]),
]);
// @end: @implementation SomeParent <Person, Parent>

// @implementation AnotherParent : SomeParent
var $the_class = objj_allocateClassPair(SomeParent, "AnotherParent");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("children", "CPArray"),    
    new objj_ivar("firstName", "CPString"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -init
    new objj_method(sel_getUid("init"),    
    function $AnotherParent__init(self, _cmd)
    {
        self = objj_msgSendSuper({ receiver: self, super_class: objj_getClass("AnotherParent").super_class }, "init");

        if (self)
            self.children = [];

        return self;
    },
    // argument types
    ["id"]),
    
    // -adopt:
    new objj_method(sel_getUid("adopt:"),    
    function $AnotherParent__adopt_(self, _cmd, child)
    {
        self.children.push(child);
    },
    // argument types
    ["void", "Person"]),
    
    // -children
    new objj_method(sel_getUid("children"),    
    function $AnotherParent__children(self, _cmd)
    {
        return self.children;
    },
    // argument types
    ["CPArray"]),
]);
// @end: @implementation AnotherParent : SomeParent
