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

// @implementation Accessors
var $the_class = objj_allocateClassPair(Nil, "Accessors");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[
    new objj_ivar("accessors", "int"),
    new objj_ivar("copyMe", "int"),
    new objj_ivar("readOnly", "int"),
    new objj_ivar("propertyAccessors", "int"),
    new objj_ivar("getter", "int"),
    new objj_ivar("setter", "int"),
    new objj_ivar("getterSetter", "int"),
    new objj_ivar("hasGetter", "int"),
    new objj_ivar("hasSetter", "int")
]);

// Instance methods
class_addMethods($the_class,
[
    // -hasGetter
    new objj_method(sel_getUid("hasGetter"),
    function $Accessors__hasGetter(self, _cmd)
    {
        return self.hasGetter;
    },
    // argument types
    ["int"]),

    // -setHasSetter:
    new objj_method(sel_getUid("setHasSetter:"),
    function $Accessors__setHasSetter_(self, _cmd, newValue)
    {
        self.hasSetter = newValue;
    },
    // argument types
    ["void", "int"]),

    // accessors @accessors [getter]
    // - (int)accessors
    new objj_method(sel_getUid("accessors"),
    function $Accessors__accessors(self, _cmd)
    {
        return self.accessors;
    },
    // argument types
    ["int"]),

    // accessors @accessors [setter]
    // - (void)setAccessors:(int)newValue
    new objj_method(sel_getUid("setAccessors:"),
    function $Accessors__setAccessors_(self, _cmd, newValue)
    {
        self.accessors = newValue;
    },
    // argument types
    ["void", "int"]),

    // copyMe @accessors(copy) [getter]
    // - (int)copyMe
    new objj_method(sel_getUid("copyMe"),
    function $Accessors__copyMe(self, _cmd)
    {
        return self.copyMe;
    },
    // argument types
    ["int"]),

    // copyMe @accessors(copy) [setter]
    // - (void)setCopyMe:(int)newValue
    new objj_method(sel_getUid("setCopyMe:"),
    function $Accessors__setCopyMe_(self, _cmd, newValue)
    {
        if (self.copyMe !== newValue)
            /* copyMe = [newValue copy] */ self.copyMe = newValue == null ? null : newValue.isa.objj_msgSend0(newValue, "copy");
    },
    // argument types
    ["void", "int"]),

    // readOnly @accessors(readonly) [getter]
    // - (int)readOnly
    new objj_method(sel_getUid("readOnly"),
    function $Accessors__readOnly(self, _cmd)
    {
        return self.readOnly;
    },
    // argument types
    ["int"]),

    // propertyAccessors @accessors(property=property) [getter]
    // - (int)property
    new objj_method(sel_getUid("property"),
    function $Accessors__property(self, _cmd)
    {
        return self.propertyAccessors;
    },
    // argument types
    ["int"]),

    // propertyAccessors @accessors(property=property) [setter]
    // - (void)setProperty:(int)newValue
    new objj_method(sel_getUid("setProperty:"),
    function $Accessors__setProperty_(self, _cmd, newValue)
    {
        self.propertyAccessors = newValue;
    },
    // argument types
    ["void", "int"]),

    // getter @accessors(getter=getMe) [getter]
    // - (int)getMe
    new objj_method(sel_getUid("getMe"),
    function $Accessors__getMe(self, _cmd)
    {
        return self.getter;
    },
    // argument types
    ["int"]),

    // getter @accessors(getter=getMe) [setter]
    // - (void)setGetter:(int)newValue
    new objj_method(sel_getUid("setGetter:"),
    function $Accessors__setGetter_(self, _cmd, newValue)
    {
        self.getter = newValue;
    },
    // argument types
    ["void", "int"]),

    // setter @accessors(setter=setMe) [getter]
    // - (int)setter
    new objj_method(sel_getUid("setter"),
    function $Accessors__setter(self, _cmd)
    {
        return self.setter;
    },
    // argument types
    ["int"]),

    // setter @accessors(setter=setMe) [setter]
    // - (void)setMe:(int)newValue
    new objj_method(sel_getUid("setMe:"),
    function $Accessors__setMe_(self, _cmd, newValue)
    {
        self.setter = newValue;
    },
    // argument types
    ["void", "int"]),

    // getterSetter @accessors(getter=getMe, setter=setIt) [getter]
    // - (int)getMe
    new objj_method(sel_getUid("getMe"),
    function $Accessors__getMe(self, _cmd)
    {
        return self.getterSetter;
    },
    // argument types
    ["int"]),

    // getterSetter @accessors(getter=getMe, setter=setIt) [setter]
    // - (void)setIt:(int)newValue
    new objj_method(sel_getUid("setIt:"),
    function $Accessors__setIt_(self, _cmd, newValue)
    {
        self.getterSetter = newValue;
    },
    // argument types
    ["void", "int"]),

    // hasGetter @accessors [setter]
    // - (void)setHasGetter:(int)newValue
    new objj_method(sel_getUid("setHasGetter:"),
    function $Accessors__setHasGetter_(self, _cmd, newValue)
    {
        self.hasGetter = newValue;
    },
    // argument types
    ["void", "int"]),

    // hasSetter @accessors [getter]
    // - (int)hasSetter
    new objj_method(sel_getUid("hasSetter"),
    function $Accessors__hasSetter(self, _cmd)
    {
        return self.hasSetter;
    },
    // argument types
    ["int"])
]);
// @end: @implementation Accessors

// @implementation Statements
var $the_class = objj_allocateClassPair(Nil, "Statements");
objj_registerClassPair($the_class);
var x = 7;

test = function test()
{
    doSomething();
};
// @end: @implementation Statements

// @implementation Methods
var $the_class = objj_allocateClassPair(Nil, "Methods");
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
// @end: @implementation Methods
