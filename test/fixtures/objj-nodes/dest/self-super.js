(function()
{
    // @implementation CPObject
    var $the_class = objj_allocateClassPair(Nil, "CPObject");
    objj_registerClassPair($the_class);
    // @end: @implementation CPObject

    // @implementation Test : CPObject
    var $the_class = objj_allocateClassPair(CPObject, "Test");
    objj_registerClassPair($the_class);

    // Instance methods
    class_addMethods($the_class,
    [
        // - (void)test
        new objj_method(sel_getUid("test"),
        function $Test__test(self, _cmd)
        {
            /* [self doSomething] */ self.isa.objj_msgSend0(self, "doSomething");
            /* [super doSomething] */ objj_msgSendSuper0({ receiver: self, super_class: objj_getClass("Test").super_class }, "doSomething");

            function testme()
            {
                /* [self doSomething] */ self.isa.objj_msgSend0(self, "doSomething");
                /* [super doSomething] */ objj_msgSendSuper0({ receiver: self, super_class: objj_getClass("Test").super_class }, "doSomething");
            }
        },
        // argument types
        ["void"])
    ]);
    // @end: @implementation Test : CPObject

    test = function test()
    {
        var self = 7;

        self = 13;
    };
})();
