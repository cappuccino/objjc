doSomething();
visitor[virtualType || node.type](node, scope, compileNode);
eval("x = 7");

function test()
{
    // This is for code coverage. eval within an objj method
    // marks self as mutated.
    var self = 7;
    
    eval("doSomething()");
}
