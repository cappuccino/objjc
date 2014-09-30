// @implementation Accessors
var $the_class = objj_allocateClassPair(Nil, "Accessors");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("name", "CPString"),    
    new objj_ivar("age", "int"),    
    new objj_ivar("title", "CPString"),    
    new objj_ivar("children", "CPArray"),    
    new objj_ivar("birthday", "CPDate"),    
    new objj_ivar("single", "BOOL"),    
    new objj_ivar("_underscore", "int"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // @accessors(getter=name)
    new objj_method(sel_getUid("name"),
    function $Accessors__name(self, _cmd)
    {
        return self.name;
    },
    // argument types
    ["CPString"]),
    
    // @accessors(setter=setName)
    new objj_method(sel_getUid("setName:"),
    function $Accessors__setName_(self, _cmd, newValue)
    {
        self.name = newValue;
    },
    // argument types
    ["void", "CPString"]),
    
    // @accessors(readonly, getter=age)
    new objj_method(sel_getUid("age"),
    function $Accessors__age(self, _cmd)
    {
        return self.age;
    },
    // argument types
    ["int"]),
    
    // @accessors(getter=getTheTitle)
    new objj_method(sel_getUid("getTheTitle"),
    function $Accessors__getTheTitle(self, _cmd)
    {
        return self.title;
    },
    // argument types
    ["CPString"]),
    
    // @accessors(setter=setTitle)
    new objj_method(sel_getUid("setTitle:"),
    function $Accessors__setTitle_(self, _cmd, newValue)
    {
        self.title = newValue;
    },
    // argument types
    ["void", "CPString"]),
    
    // @accessors(getter=children)
    new objj_method(sel_getUid("children"),
    function $Accessors__children(self, _cmd)
    {
        return self.children;
    },
    // argument types
    ["CPArray"]),
    
    // @accessors(setter=adoptChildren)
    new objj_method(sel_getUid("adoptChildren:"),
    function $Accessors__adoptChildren_(self, _cmd, newValue)
    {
        self.children = newValue;
    },
    // argument types
    ["void", "CPArray"]),
    
    // @accessors(getter=dob)
    new objj_method(sel_getUid("dob"),
    function $Accessors__dob(self, _cmd)
    {
        return self.birthday;
    },
    // argument types
    ["CPDate"]),
    
    // @accessors(setter=setDOB)
    new objj_method(sel_getUid("setDOB:"),
    function $Accessors__setDOB_(self, _cmd, newValue)
    {
        if (self.birthday !== newValue)
            self.birthday = newValue == null ? null : newValue.isa.objj_msgSend0(newValue, "copy");
    },
    // argument types
    ["void", "CPDate"]),
    
    // @accessors(getter=isSingle)
    new objj_method(sel_getUid("isSingle"),
    function $Accessors__isSingle(self, _cmd)
    {
        return self.single;
    },
    // argument types
    ["BOOL"]),
    
    // @accessors(setter=setIsSingle)
    new objj_method(sel_getUid("setIsSingle:"),
    function $Accessors__setIsSingle_(self, _cmd, newValue)
    {
        self.single = newValue;
    },
    // argument types
    ["void", "BOOL"]),
    
    // @accessors(readonly, getter=underscore)
    new objj_method(sel_getUid("underscore"),
    function $Accessors__underscore(self, _cmd)
    {
        return self._underscore;
    },
    // argument types
    ["int"]),
]);
// @end: @implementation Accessors

// @implementation Getter
var $the_class = objj_allocateClassPair(Nil, "Getter");
objj_registerClassPair($the_class);

class_addIvars($the_class,
[    
    new objj_ivar("name", "CPString"),
]);

// Instance methods
class_addMethods($the_class,
[    
    // -setName:
    new objj_method(sel_getUid("setName:"),    
    function $Getter__setName_(self, _cmd, newValue)
    {
        self.name = newValue;
    },
    // argument types
    ["void", "CPString"]),
    
    // -name
    new objj_method(sel_getUid("name"),    
    function $Getter__name(self, _cmd)
    {
        return self.name;
    },
    // argument types
    ["CPString"]),
]);
// @end: @implementation Getter
