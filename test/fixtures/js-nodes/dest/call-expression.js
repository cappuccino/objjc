doSomething();
visitor[virtualType || node.type](node, scope, compileNode);
eval("x = 7");

function test()
{
    var self = 7;

    eval("doSomething()");
}
