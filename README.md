ObjJAcornCompiler
=================

A tiny, fast JavaScript and/or [Objective-J][objj] compiler with built in preprocessor. Written in JavaScript.

[objj]: http://www.cappuccino-project.org/learn/objective-j.html

It uses a parser extended from the [Acorn][objj-acorn] JavaScript parser by Marijn Haverbeke.

[objj-acorn]: https://github.com/mrcarlberg/acorn

The parser has a built in C like preprocessor.

Example:
```c
#define MAX(x, y) (x > y ? x : y)
var m1 = MAX(a, b);
var m2 = MAX(14, 20);
```
Will be compiled to:
```c
var m1 = (a > b ? a : b);
var m2 = (14 > 20 ? 14 : 20);
```
For more info see http://www.cappuccino-project.org/blog/2013/05/the-new-objective-j-2-0-compiler.html

Objective-J limitations:
It can't compile Objective-J code that depends on other Objective-J files. The Objective-J load and
runtime is needed for this. But it will work as long as you declare any superclass in the same file.
This will be fixed when the Objective-J load and runtime will be a node module