Objective-J Compiler
====================

A tiny, fast JavaScript and/or [Objective-J][objj] compiler with built in preprocessor. Written in JavaScript.

[objj]: http://www.cappuccino-project.org/learn/objective-j.html

It uses a parser extended from the [Acorn][objj-acorn] JavaScript parser by Marijn Haverbeke.

[objj-acorn]: https://github.com/cappuccino/objj-acorn

## Format generated code

The generated code can be formatted by providing a format description file with the '--formatDescription' option
There are some example files in the format folder.

It can also include comments with the '--includeComments' option.

## Beautifier

Objective-J is a superset of Javascript. If it compiles a pure Javascript file it will generate the same code back again.
This allows the compiler to be used as a beautifier for Javascript.

## Preprocessor

The parser has a built in C like preprocessor.

Example:

```c
#define MAX(x, y) (x > y ? x : y)
var m1 = MAX(a, b);
var m2 = MAX(14, 20);
```

Will be compiled to:

```c
var m1 = a > b ? a : b;
var m2 = 14 > 20 ? 14 : 20;
```

For more info see http://www.cappuccino-project.org/blog/2013/05/the-new-objective-j-2-0-compiler.html

Objective-J limitations:
It can't compile Objective-J code that depends on other Objective-J files. The Objective-J load and
runtime is needed for this. But it will work as long as you declare any superclass in the same file.
This will be fixed when the Objective-J load and runtime will be a node module

## Error checking

`objjc` has extensive error checking to catch potential errors before runtime. Warnings and errors are displayed in the following format:

```
<file path>:<line>:<column>: \[warning\|error\]: <message>
<offending line>
<caret column marker>
```

<file path> is relative to the file being compiled. <line> and <column> are one-based.

Here are some examples:

```
identifiers.j:114:25: warning: local declaration of 'foobar' shadows a variable in a containing closure
                    var foobar = "foobar";
                        ^
identifiers.j:105:17: note: declaration is here
            var foobar = 27,
                ^
protocols.j:34:45: error: cannot find protocol declaration for 'Unknown'
@implementation SomeParent <Person, Parent, Unknown>
                                             ^
```

As you can see in the above example, `objjc` adds helpful notes in addition to the warning or error when necessary.

Following is a list of sample warnings and errors caught by `objjc`, each followed by example code that generated the warning or error. Note in the examples that `function` is the equivalent of an Objective-J method in terms of scoping variables.

### Warnings

    local declaration of 'foo' shadows a global variable

```objj
foo = 7;

function bar()
{
    var foo = 13;   // warning
}
```

***

    local declaration of 'foo' shadows a @global declaration
    
```objj
@global foo;

function bar()
{
    var foo = 13;   // warning
}
```

***

    local declaration of 'foo' shadows a file variable
    
```objj
var foo = 7;

function bar()
{
    var foo = 13;   // warning
}
```

***

    local declaration of 'foo' shadows a class
    
```objj
@class foo;

function bar()
{
    var foo = 13;   // warning
}
```

***

    local declaration of 'SomeClass' shadows a class

```objj
@implementation SomeClass
@end

@implementation AnotherClass

- (void)haveSomeClass
{
    var SomeClass = 7;   // warning
}

@end
```

***

    local declaration of 'bar' shadows an instance variable
        
```objj
@implementation Foo
{
    int bar;
}

- (void)foo
{
    var bar = 13;   // warning
}
```

***

    reference to local variable 'bar' shadows an instance variable
        
```objj
@implementation Foo
{
    int bar;
}

- (void)foo
{
    bar = 13;  // reference shadow warning
    var bar;   // declaration shadow warning
}
```

This warning only occurs if a reference to a local variable occurs before its declaration.

***

    local declaration of 'window' shadows a predefined global
        
```objj
function bar()
{
    var window = 13;   // warning
}
```

See the section [Predefined globals](#predefined_globals) for information on what names are considered predefined.

***

    local declaration of 'foo' shadows a variable in a containing closure
        
```objj
function bar()
{
    var foo = 13;
    
    setTimeout(function()
    {
        var foo = 7;  // warning
    },
    100);
}
```

***

    reference to unknown identifier 'baz'
        
```objj
function bar()
{
    var foo = baz;  // warning
}
```

***

    reference to unknown identifier 'foo'; did you mean 'Foo'?
        
```objj
@class Foo

@implementation Bar
- (void)bar
{
    [foo doSomething];  // warning
}
@end
```

If an unknown identifier differs from a class or protocol name in case only, the class or protocol name is suggested.

***

    assigning to a read-only predefined global
        
```objj
function bar()
{
    window = 13;
}
```

***

    conflicting return type in implementation of 'addOneTo': 'double' vs 'int'
        
```objj
@implementation Foo

- (int)addOneTo:(int)value
{
    return value + 1;
}

@end

@implementation Bar : Foo

- (double)addOneTo:(int)value  // warning
{
    return value + 1;
}

@end
```

***

    conflicting parameter type in implementation of 'addOneTo': 'double' vs 'int'
        
```objj
@implementation Foo

- (int)addOneTo:(int)value
{
    return value + 1;
}

@end

@implementation Bar : Foo

- (int)addOneTo:(double)value  // warning
{
    return value + 1;
}

@end
```

***

    implicitly creating a global variable in the method 'foo'; did you mean to use 'var c'?
        
```objj
- (void)foo
{
    var a = 7,
        b = 13;
        c = 27;  // oops, this is an unintentional global
}
```

***

    debugger statement
        
```objj
- (void)foo
{
    debugger;  // warning
}
```

***

    reserved word used for variable name
        
```objj
var NaN = 7;  // NaN is a JavaScript reserved word
```

***

    cannot find protocol declaration for 'Unknown'
        
```objj
- (void)foo:(id<Unknown>)  // warning
```

***

    multiple declarations of method 'foo' found and ignored
        
```objj
@protocol Foo
- (void)foo;
- (void)foo;  // warning
@end
```

***

    method 'foo' in protocol 'Foo' not implemented
        
```objj
@protocol Foo
- (void)foo;
@end

@implementation Bar <Foo>  // warning
@end
```

***

    unknown type 'badType'
        
```objj
@implementation Foo
{
    badType ivar;  // warning
}

- (badType)foo  // warning
{
}

- (void)bar:(badType)something  // warning
{
}
```

### Errors

    duplicate definition of method 'foo'
        
```objj
@implementation Foo
- (void)foo {}
- (void)foo {}  // error
@end
```

***

    cannot find protocol declaration for 'Unknown'
        
```objj
@implementation Foo <Unknown>
@end
```

***

    cannot find implementation declaration for 'Bar', superclass of 'Foo'
        
```objj
@implementation Foo : Bar  // error
@end
```

***

    dereference expressions may not have side effects
        
```objj
@deref([self someRef]) += 7;  // [self someRef] may have side effects
```

***

    redeclaration of instance variable 'foo' in class 'Bar'
        
```objj
@implementation Foo
{
    int foo;
}
@end

@implementation Bar
{
    double foo;  // error
}
@end
```

***

    duplicate definition of class 'Foo'
        
```objj
@implementation Foo
@end

@implementation Foo  // error
@end
```

***

    duplicate definition of protocol 'Foo'
        
```objj
@protocol Foo
@end

@protocol Foo  // error
@end
```

***

    'foo' previously defined as a global
        
```objj
@global foo
@class foo  // error
```

When a global declaration is encountered, the identifier is checked to see if it has already been declared as a global of a different type. This applies to `@class`, `@global`, global variables, `@interface`, `@implementation` and `@protocol`.

***

    setter cannot be specified for a readonly property
        
```objj
@implementation Foo
{
    int badProperty @accessors(setter=setBad, readonly);  // error
}
@end
```


## Predefined globals

When checking identifiers, the compiler checks against a list of known **predefined globals**. **Predefined globals** refers to the set of globals that are defined as part of the runtime enviroment under which the compiled file will run: `browser` or `node`. The predefined globals the compiler checks are contained in the file `lib/globals.js`. The complete set of predefined globals is defined by the exported objects: 
                                                                                               
- reserved
- nonstandard
- ecmaIdentifiers
- newEcmaIdentifiers
- exports\[\<environment\>\]
- devel (if \<environment\> is "browser")

The value of each name in these objects is used as follows:

- If `true`, the global is writable.
- If `false`, it is read only and an attempt to change its value will generate a compiler warning.
- If an object, the field `writable` determines whether its value can be changed, and if the field `ignoreShadow` is `true`, the compiler will not generate a warning if a local variable uses the same name.
