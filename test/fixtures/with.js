if (foo)
    with (foo)
        bar = 7;

if (bar)
{
    with (bar)
    {
        foo = 7;
        bar = 13;
    }
}

with (foo)
{
    bar = 27;

    with (foobar)
        baz = "foo";
}
