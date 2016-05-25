while (true)
{
    if (test())
        break;
}

outer:
for (var i = 0; i < 7; i++)
{
    for (var j = 0; j < i; j++)
    {
        if (j % i === 2)
            break outer;

        console.log("j = " + j);
    }

    console.log("i = " + i);
}
