// @protocol Parent
var $the_protocol = objj_allocateProtocol("Parent");

objj_registerProtocol($the_protocol);

protocol_addMethodDescriptions($the_protocol,
[    
    // -one
    new objj_method(sel_getUid("one"), null,
    // argument types
    ["void"]),
    
    // -two
    new objj_method(sel_getUid("two"), null,
    // argument types
    ["int"]),
],
true, true);
protocol_addMethodDescriptions($the_protocol,
[    
    // +classMethod
    new objj_method(sel_getUid("classMethod"), null,
    // argument types
    ["void"]),
],
true, false);
// @end: @protocol Parent

// @protocol Child <Parent>
var $the_protocol = objj_allocateProtocol("Child");

var $the_inherited_protocol = objj_getProtocol("Parent");

if (!$the_inherited_protocol)
    throw new ReferenceError("Cannot find protocol declaration for 'Parent'");

protocol_addProtocol($the_protocol, $the_inherited_protocol);

objj_registerProtocol($the_protocol);

protocol_addMethodDescriptions($the_protocol,
[    
    // -three
    new objj_method(sel_getUid("three"), null,
    // argument types
    ["float"]),
    
    // -required
    new objj_method(sel_getUid("required"), null,
    // argument types
    ["id"]),
],
true, true);
// @end: @protocol Child <Parent>
