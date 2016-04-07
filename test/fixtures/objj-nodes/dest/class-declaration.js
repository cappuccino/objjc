// @implementation Empty
var $the_class = objj_allocateClassPair(Nil, "Empty");
objj_registerClassPair($the_class);
// @end: @implementation Empty

// @implementation Empty (Category)
var $the_class = objj_getClass("Empty");

if (!$the_class)
    throw new ReferenceError("Cannot find declaration for class 'Empty'");

// @end: @implementation Empty (Category)

// @implementation Subclass : Empty
var $the_class = objj_allocateClassPair(Empty, "Subclass");
objj_registerClassPair($the_class);
// @end: @implementation Subclass : Empty

// @protocol Protocol1
var $the_protocol = objj_allocateProtocol("Protocol1");

objj_registerProtocol($the_protocol);

// @end: @protocol Protocol1

// @protocol Protocol2
var $the_protocol = objj_allocateProtocol("Protocol2");

objj_registerProtocol($the_protocol);

// @end: @protocol Protocol2

// @implementation OneProtocol <Protocol1>
var $the_class = objj_allocateClassPair(Nil, "OneProtocol");
var $the_protocol = objj_getProtocol("Protocol1");

if (!$the_protocol)
    throw new ReferenceError("Cannot find protocol declaration for 'Protocol1'");

class_addProtocol($the_class, $the_protocol);
objj_registerClassPair($the_class);
// @end: @implementation OneProtocol <Protocol1>

// @implementation TwoProtocols <Protocol1, Protocol2>
var $the_class = objj_allocateClassPair(Nil, "TwoProtocols");
var $the_protocol = objj_getProtocol("Protocol1");

if (!$the_protocol)
    throw new ReferenceError("Cannot find protocol declaration for 'Protocol1'");

class_addProtocol($the_class, $the_protocol);
$the_protocol = objj_getProtocol("Protocol2");

if (!$the_protocol)
    throw new ReferenceError("Cannot find protocol declaration for 'Protocol2'");

class_addProtocol($the_class, $the_protocol);
objj_registerClassPair($the_class);
// @end: @implementation TwoProtocols <Protocol1, Protocol2>

// @implementation EmptyIvars
var $the_class = objj_allocateClassPair(Nil, "EmptyIvars");
objj_registerClassPair($the_class);
// @end: @implementation EmptyIvars

// @implementation Ivars
var $the_class = objj_allocateClassPair(Nil, "Ivars");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[
    new objj_ivar("one", "int"),
    new objj_ivar("two", "Empty"),
    new objj_ivar("outlet", "id"),
    new objj_ivar("outlet2", "id")
]);
// @end: @implementation Ivars

// @implementation Statements
var $the_class = objj_allocateClassPair(Nil, "Statements");
objj_registerClassPair($the_class);
var x = 7;

test = function test()
{
    doSomething();
};
// @end: @implementation Statements

// @implementation Methods : Statements
var $the_class = objj_allocateClassPair(Statements, "Methods");
objj_registerClassPair($the_class);
var initialized = false,
    initCount = 0;

// Instance methods
class_addMethods($the_class,
[
    // -init
    new objj_method(sel_getUid("init"),
    function $Methods__init(self, _cmd)
    {
        self = /* [super init] */ objj_msgSendSuper0({ receiver: self, super_class: objj_getClass("Methods").super_class }, "init");

        if (self)
            initCount++;

        return self;
    },
    // argument types
    ["id"]),
]);

// Class methods
class_addMethods($the_class.isa,
[
    // +initialize
    new objj_method(sel_getUid("initialize"),
    function $Methods__initialize(self, _cmd)
    {
        initialized = true;
    },
    // argument types
    ["void"]),
]);
// @end: @implementation Methods : Statements
