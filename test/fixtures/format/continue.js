for (var i = 0; i < 10; i++)
{
    if (i % 2 === 0)
        continue;

    print(i);
}

var j = 0;

loop:
for (var j = 0; j < 100; j++)
    for (var i = 0; i < 10; i++)
        if (i % 2 !== 0)
            continue loop;
        else
            print(i);

print("hello");
