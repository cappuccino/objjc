"use strict";

/**
 * API-compatible version of StringBuffer that does nothing. Used when importing
 * since no code needs to be generated when importing.
 */
class NullBuffer
{
    remove(/* index */)
    {
    }

    concat(/* string, node */)
    {
    }

    concatFormat(/* node, scope, selector */)
    {
    }

    concatWithFormat(/* node, scope, string, format, mapNode */)
    {
    }

    concatWithFormats(/* node, scope, before, string, after, mapNode */)
    {
    }

    concatLeftParens(/* node, scope */)
    {
    }

    concatRightParens(/* node, scope */)
    {
    }

    concatComma(/* node, scope */)
    {
    }

    concatOperator(/* node, scope, operator */)
    {
    }

    concatParenthesizedBlock(node, scope, func)
    {
        // istanbul ignore next: no need to test
        if (func)
            func();
    }

    concatBuffer(/* buffer */)
    {
    }
}

module.exports = NullBuffer;
