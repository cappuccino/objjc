(function()
{
    // @protocol SomeProtocol
    var $the_protocol = objj_allocateProtocol("SomeProtocol");

    objj_registerProtocol($the_protocol);

    // @end: @protocol SomeProtocol

    var p = objj_getProtocol("SomeProtocol");
})();
