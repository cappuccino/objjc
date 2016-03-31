o = {
    first: "Francisco",
    last: "Tolmasky"
};

with (o)
    console.log(first + " " + last);

with (o)
{
    console.log(first);
    console.log(last);
}
