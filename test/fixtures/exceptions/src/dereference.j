function test(choose, ref1, ref2)
{
    // @deref can only take an identifier.
    @deref(choose ? ref1 : ref2) = 7;

    // To work, the code above must be written:
    var ref = choose ? ref1 : ref2;

    @deref(ref) = 7;
}

var x, y;

test(true, @ref(x), @ref(y));
