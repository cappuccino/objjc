(function()
{
    // @typedef ColorType
    objj_registerTypeDef(objj_allocateTypeDef("ColorType"));
    // @typedef ViewType, DataSource
    objj_registerTypeDef(objj_allocateTypeDef("ViewType"));
    objj_registerTypeDef(objj_allocateTypeDef("DataSource"));

    // @implementation Test
    var $the_class = objj_allocateClassPair(Nil, "Test");
    objj_registerClassPair($the_class);

    class_addIvars($the_class,
    [
        new objj_ivar("color", "ColorType"),
        new objj_ivar("view", "ViewType"),
        new objj_ivar("dataSource", "DataSource")
    ]);

    // Instance methods
    class_addMethods($the_class,
    [
        // - (BOOL)hasColorOfType:
        new objj_method(sel_getUid("hasColorOfType:"),
        function $Test__hasColorOfType_(self, _cmd, type)
        {
            return type === self.color;
        },
        // argument types
        ["BOOL", "ColorType"])
    ]);
    // @end: @implementation Test
})();
