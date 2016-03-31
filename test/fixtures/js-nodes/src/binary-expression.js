// Coverage for Compiler.subnodeHasPrecedence

// subnodePrecedence > nodePrecendence
x = (y ? 7 : 31) > 27;

// nodePrecedence === subnodePrecedence && isLogicalOrBinaryExpression.test(nodeType)
//    subnodeOperatorPrecedence > nodeOperatorPrecedence
x = (7 + 13) * 27;

// nodePrecedence === subnodePrecedence && isLogicalOrBinaryExpression.test(nodeType)
//    right === true && nodeOperatorPrecedence === subnodeOperatorPrecedence
x = 7 + (13 + 27);

// Parens except for (10-3) should be removed because they duplicate precedence rules
x = (7 * 13) + 27 << ((31 / 2) % (10 - 3));
