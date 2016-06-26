(function()
{
    // @protocol Person
    var $the_protocol = objj_allocateProtocol("Person");

    objj_registerProtocol($the_protocol);

    protocol_addMethodDescriptions($the_protocol,
    [
        // - (void)eat
        new objj_method(sel_getUid("eat"), null,
        // argument types
        ["void"])
    ],
    true, true);
    // @end: @protocol Person

    // @protocol Parent
    var $the_protocol = objj_allocateProtocol("Parent");

    objj_registerProtocol($the_protocol);

    protocol_addMethodDescriptions($the_protocol,
    [
        // - (void)one
        new objj_method(sel_getUid("one"), null,
        // argument types
        ["void"]),

        // - (int)two
        new objj_method(sel_getUid("two"), null,
        // argument types
        ["int"])
    ],
    true, true);

    protocol_addMethodDescriptions($the_protocol,
    [
        // + (void)classMethod
        new objj_method(sel_getUid("classMethod"), null,
        // argument types
        ["void"])
    ],
    true, false);
    // @end: @protocol Parent

    // @protocol Child <Parent, Person>
    var $the_protocol = objj_allocateProtocol("Child");

    var $the_incorporated_protocol = objj_getProtocol("Parent");

    if (!$the_incorporated_protocol)
        throw new ReferenceError("Cannot find protocol declaration for 'Parent'");

    protocol_addProtocol($the_protocol, $the_incorporated_protocol);

    $the_incorporated_protocol = objj_getProtocol("Person");

    if (!$the_incorporated_protocol)
        throw new ReferenceError("Cannot find protocol declaration for 'Person'");

    protocol_addProtocol($the_protocol, $the_incorporated_protocol);

    objj_registerProtocol($the_protocol);

    protocol_addMethodDescriptions($the_protocol,
    [
        // - (float)three
        new objj_method(sel_getUid("three"), null,
        // argument types
        ["float"]),

        // - (id)required
        new objj_method(sel_getUid("required"), null,
        // argument types
        ["id"])
    ],
    true, true);
    // @end: @protocol Child <Parent, Person>

    // @implementation Person <Person>
    var $the_class = objj_allocateClassPair(Nil, "Person");
    var $the_protocol = objj_getProtocol("Person");

    if (!$the_protocol)
        throw new ReferenceError("Cannot find protocol declaration for 'Person'");

    class_addProtocol($the_class, $the_protocol);
    objj_registerClassPair($the_class);

    // Instance methods
    class_addMethods($the_class,
    [
        // - (void)eat
        new objj_method(sel_getUid("eat"),
        function $Person__eat(self, _cmd)
        {
            console.log("Yum!");
        },
        // argument types
        ["void"])
    ]);
    // @end: @implementation Person <Person>
})();
