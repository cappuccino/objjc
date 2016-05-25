function test()
{
    return someTest() ? "Woo-hoo!" : "Bummer";
}

function test2()
{
    doSomething();

    return {
        first: "Francisco",
        last: "Tolmasky"
    };
}

function test3()
{
    doSomething();

    if (test())
        return;

    doSomethingElse();
}
