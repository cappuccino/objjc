# Using Formats

The `objjc` compiler uses *format definitions* to determine how the generated source is formatted. This allows you to use whatever code formatting style you prefer.


## Source generation

To understand how format definitions work, it helps to understand how `objjc` generates code and how the source is structured.

1. The source is parsed into an *abstract syntax tree* (AST), with each node of the tree representing a type of language element, for example a literal string or an `if` statement. Each node has a named type, or example "Literal" and "IfStatement".

1. The compiler traverses the AST and calls a generator function for the node based on its type name.

1. The generator function generates code for the given node type. In the case of JavaScript node types, the generated code is the same as the original, but is reformatted according to the active format definition. In the case of Objective-J node types, the compiler translates Objective-J syntax into JavaScript.


### Source structure

When coding guidelines are formulated, they are almost always expressed in terms of a visual hierarchy that formulates how statements relate to their preceding siblings or parents. Accordingly, `objjc` maintains a hierarchy of *statement nodes* and *parent nodes* that allow you to format nodes precisely according to their relationship to preceding nodes.

**Statement nodes** correspond to a line of code. You can control the format of any given node based on the previous statement node (i.e. the preceding line of code) within the current parent node.

**Parent nodes** are nodes that logically contain other nodes, for example a `for` statement. You can control the format of any given node based on the node’s immediate parent. The top level parent for all nodes is the "program" node.


## Format definition structure

Format definitions are JSON files. The top level object contains two types of items: **node items** and **meta items**.


### Node items

Node items in a format definition control the formatting of a specific node type in the AST. Each node item consists of a *node item name* as the key and a *selector* object as the value. The available node item names are:

Name | Comments
-------- | ---------------
, | Sequential expression, e.g. `i = 0, j = 1;`
@[] | Objective-J array literal, e.g. `@[1, 2, 3]`
@class | Objective-J forward class declaration, e.g. `@class SomeClass`
@deref | Objective-J dereference expression, e.g. `@deref(someRef) = 0;`
@global | Objective-J forward global declaration, e.g. `@global SomeGlobal`
@implementation | Objective-J class declaration, e.g. `@implementation MyView : CPView`
@import | Objective-J import statement, e.g. `@import <AppKit/CPView.j>`
@interface | Objective-J interface statement, e.g. `@interface MyView`
@protocol | Objective-J protocol declaration, e.g. `@protocol SomeProtocol`
@protocol() | Objective-J protocol expression, e.g. `var p = @protocol(SomeProtocol);`
@ref | Objective-J reference expression, e.g. `[view doSomethingWithRef:@ref(someVar)]`
@selector | Objective-J selector expression, e.g. `@selector(MyView:doSomething)`
@typedef | Objective-J typedef expression, e.g. `@typedef MyView`
@{} | Objective-J object literal, e.g. `@{ "foo": 7, "bar": "baz" }`
array | JavaScript array literal, e.g. `[1, 2, 3]`
assignment | Assignment expression, e.g. `name = @"Alexander";`
binary&nbsp;expression | Binary mathematical or bitwise operator expression, e.g. `1 + 2`
break | `break` keyword
continue | `continue` keyword
debugger | `debugger` statement
do while | 
else if | `else if..else` statement
for | 
for in | 
function | Function declaration, e.g. `function foo()`
function&nbsp;call | Call to a function, e.g. `foo("bar")`
function&nbsp;expression | Function assigned to a variable, e.g. `var foo = function()`
identifier | Any non-literal identifier (variable reference, class, ivar, etc.)
identifier&nbsp;name | An identifier that is just a name, without being part of an expression (variable name, label name, function argument, etc.)
if | `if..else` statement
ivar | ivar (instance variable) declaration
label | Label such as `loop:`
lambda | Function whose body has zero or one statements
literal | String, number, regular expression, `null`,  `true`,  `false`
logical&nbsp;expression | Binary logical expression, e.g. `a | b`
member | Reference to a member of a JavaScript object, e.g. `obj.name`
message&nbsp;send | Objective-J message send expression, e.g. `[view bounds]`
method | Objective-J method declaration
new | JavaScript `new` expression, e.g. `var today = new Date();`
object | JavaScript object literal, e.g. `{ "foo": 7, "bar": "baz" }`
objective-j&nbsp;type | Objective-J type name (id, int, double, SEL, etc.)
program | The top level container for a compiled file
return | 
switch | 
ternary&nbsp;expression | condition ? trueExpression : falseExpression
this | 
throw | 
try | `try..catch..finally`
unary&nbsp;expression | Unary operator that does not update an existing value, e.g. `i = -7`
update&nbsp;expression | Unary operator that updates an existing value, e.g. `++i`
var | `var` block, may contain multiple declarations
while | 
{} | statement block

**Note**: Node item names are internally mapped to node type names in the AST. For example, the node type "ForStatement" is mapped to the node item name "for".

### Meta items

Meta items are a special type of node item that applies to multiple node types. To create a meta item, there are two steps:

1. Prefix the node item name with '\*', e.g. "\*control".

1. Add a "nodes" array item to the selector object, whose contents are the node item names you want the format definition to apply to.

For example, the standard "cappuccino" format uses the following meta item to apply a selector object to all control flow node types:

```json
"*control": {
    "nodes": [
        "@implementation",
        "@protocol",
        "do while",
        "if",
        "for",
        "for in",
        "function",
        "switch",
        "try",
        "while",
        "with"
    ],
    "before": {
        "*": "\n\n",
        "$previous": {
            "*control": "\n\n",
            "*statement": "\n\n",
            "label": "\n",
            "null": {
                "*": "\n",
                "$parent": {
                    "lambda": " "
                }
            },
            "var": "\n\n"
        }
    },
    "before-left-parens": " ",
    "after-left-parens": ""
}
```

**Global meta items**
If you want to create a global meta item that applies to **all** nodes, use "\*" as the node item name. A global meta item doesn’t need a "nodes" array since it automatically applies to all nodes. Note that the global meta item is only used if a specific lookup for a given node item type fails.

For example, the standard "cappuccino" format defines the following global meta item:

```json
"*": {
    "indent-string": " ",
    "indent-width": 4,
    "single-line-array-limit": 2,
    "before-comma": "",
    "after-comma": " ",
    "before-operator": " ",
    "after-operator": " ",
    "after-left-parens": "",
    "before-left-parens": ""
}
```

Note that the first three items in the global meta item are not related to any nodes; they provide global constants that define the following behavior:

- **indent-string** – The character used to indent. If you want to indent using spaces, this should be a single space. If you want to indent using tabs, it should be a single tab.

- **indent-width** – How many times *indent-string* is repeated to perform an indent. For spaces, this is typically 2 or 4. For tabs, it would typically be 1.

- **single-line-array-limit** – When formatting an array, if it has more than this number of elements, they are each put on a separate line. Otherwise the array is formatted as a single line.


### Selector objects

Selector objects determine what text is prefixed and/or suffixed to the different components of a given AST node. The structure of a selector object is as follows:

- The keys of the object represent the component of the node that is being formatted, e.g. "before-left-parens" and "after-left-parens".

- The values of the object are either strings or objects.

    - If the value is a string, it is used for all matching nodes.
    
    - If the value is an object, the keys of the object should be node item names and the values should be strings. Note that meta items may be used as keys, in addition to the special keys "$parent", "$previous" and "null", which are described in ["Relationship node item keys"](#relationship_node_item_keys) below.

For example, the standard "cappuccino" format has the following selector object for the "var" node item:

```json
"var": {
    "before": {
        "*": "\n\n",
        "$previous": {
            "null": {
                "*": "\n",
                "$parent": {
                    "for": ""
                }
            }
        }
    },
    "before-assign": " ",
    "after-assign": " ",
    "after-comma": {
        "*": "\n    ",
        "$parent": {
            "for": " "
        }
    },
    "after": {
        "*": ";",
        "$parent": {
            "for": ""
        }
    }
}
```

To understand how all of this works, we need to understand how the compiler looks up a format value.


## Format lookup

When the compiler traverses the AST nodes, it formats the generated code as follows:

1. Before the node is compiled, the "before" format for the given node type is appended to the generated source code.

1. The node is compiled. Depending on the node type, various components of the node may have formats prepended and/or appended. See the “Node format selectors” table below for a list of the format selectors used with different node types.

1. After the node is compiled, the "after" format for the given node type is appended to the generated source code.

The actual lookup process is as follows:

1. The node type (e.g. "IfStatement") is passed along with a selector (e.g. "before‑left‑parens") to a formatting method.

1. The internal node type is mapped to a node item type (e.g. "IfStatement" is mapped to "if"). If no mapping exists, no format is applied.

1. The format is searched for a node item whose key is the given key. If no item exists with the given key, the result of looking up the selector in the global meta item is returned.

1. If a node item is found, the selector object is checked for an item that matches the selector. If no item matches the selector, the result of looking up the selector in the global meta item is returned.

1. If the selector object item is a string, that string is returned.

1. If the selector object item is an object, the object is recursively searched until an exact match is found. If no exact match is found, the most nested occurrence of a "\*" item is returned. If there is no "\*" item anywhere in the object hierarchy, the result of looking up the selector in the global meta item is returned.


### Relationship node item keys

When formatting a given node, you frequently need to change the format depending on its relationship to the previous statement node or parent node. You do this by using the special keys "$previous" and "$parent". The value of these keys is then used as the selector object item with the previous or parent node type as the selector.


## Examples

Perhaps the best way to understand how this all works is to look at some examples. We will use the "cappuccino" format, which encodes the [Cappuccino coding guidelines](https://github.com/cappuccino/cappuccino/blob/master/CONTRIBUTING.md#cappuccino-coding-style-guidelines).

We will start by defining some global defaults using the global meta item:

```json
"*": {
    "indent-string": " ",
    "indent-width": 4,
    "single-line-array-limit": 2,
    "before-comma": "",
    "after-comma": " ",
    "before-operator": " ",
    "after-operator": " ",
    "after-left-parens": "",
    "before-left-parens": ""
}
```

Here’s what this means:

- We want to indent using 4 spaces.
- If an array has more than 2 elements, put the elements on separate lines.
- We want no space before and 1 space after commas.
- We want operators to be surrounded by a space.
- We want no space before or after left parentheses.

To be continued...
