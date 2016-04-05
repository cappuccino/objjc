"use strict";

const
    indenter = require("./indentation.js").indenter,
    path = require("path"),
    sourceMap = require("source-map");

class StringBuffer
{
    constructor(compiler)
    {
        this.atoms = [];
        this.locations = [];
        this.generateSourceMap = compiler.options.sourceMap;
        this.sourceMap = null;

        if (this.generateSourceMap)
        {
            // File paths aren't very useful in a source map.
            // So we will assume the source root is valid and use the filename.
            this.sourcePath = path.basename(compiler.sourcePath);

            this.sourceMapGenerator = new sourceMap.SourceMapGenerator(
                {
                    sourceRoot: compiler.options.sourceRoot
                }
            );
        }
        else
            this.sourceMapGenerator = null;
    }

    get length()
    {
        return this.atoms.length;
    }

    toString()
    {
        // Trim whitespace at the beginning
        for (let i = 0; i < this.atoms.length; i++)
        {
            if (/^\s+$/.test(this.atoms[i]))
                this.atoms[i] = "";
            else
                break;
        }

        return this.atoms.join("");
    }

    concat(string, node)
    {
        this.atoms.push(string);

        if (this.generateSourceMap)
            this.locations.push(node ? { line: node.loc.start.line, column: node.loc.start.column } : null);
    }

    remove(index)
    {
        this.atoms[index] = "";

        // Mark the node undefined so it won't be used
        if (this.generateSourceMap)
            this.locations[index] = null;
    }

    static advancePosition(position, string)
    {
        let lastPos = 0;

        while (true)
        {
            const pos = string.indexOf("\n", lastPos);

            if (pos >= 0)
            {
                ++position.line;
                position.column = 0;
                lastPos = pos + 1;
            }
            else
            {
                position.column += string.length - lastPos;
                break;
            }
        }
    }

    getSourceMap()
    {
        if (this.generateSourceMap && !this.sourceMap)
        {
            const position = { line: 1, column: 0 };

            for (let i = 0; i < this.locations.length; i++)
            {
                const location = this.locations[i];

                if (location)
                {
                    this.sourceMapGenerator.addMapping({
                        source: this.sourcePath,
                        original: {
                            line: location.line,
                            column: location.column
                        },
                        generated: {
                            line: position.line,
                            column: position.column
                        }
                    });
                }

                this.constructor.advancePosition(position, this.atoms[i]);
            }

            this.sourceMap = this.sourceMapGenerator.toString();
        }

        return this.sourceMap;
    }

    concatFormat(node, scope, selector)
    {
        if (!selector)
            return;

        const
            format = scope.compiler.format,
            value = format.valueForProperty(node, node.type, selector);

        if (!value)
            return;

        const
            lines = value.split("\n"),
            lastIndex = lines.length - 1;

        for (let i = 0; i <= lastIndex; i++)
        {
            let line = lines[i],
                pos = line.indexOf("|"),
                isEmptyLine = false;

            if (pos >= 0)
            {
                const indentAmount = parseInt(line.substring(pos + 1), 10);

                if (indentAmount > 0)
                    indenter.indent(indentAmount);
                else if (indentAmount < 0)
                    indenter.dedent(-indentAmount);
                else // indentAmount === 0
                    isEmptyLine = true;

                line = line.substring(0, pos);
            }

            // If there are multiple lines, don't indent empty ones before the last.
            if (!isEmptyLine && i > 0)
            {
                if (i < lastIndex && line.length === 0)
                    lines[i] = line;
                else
                    lines[i] = indenter.indentation + line;
            }
            else
                lines[i] = line;
        }

        this.concat(lines.join("\n"));
    }

    concatWithFormat(node, scope, string, format, mapNode)
    {
        format = format || string;

        this.concatFormat(node, scope, "before-" + format);
        this.concat(string, mapNode ? node : null);
        this.concatFormat(node, scope, "after-" + format);
    }

    concatWithFormats(node, scope, before, string, after, mapNode)
    {
        if (before)
            this.concatFormat(node, scope, before);

        this.concat(string, mapNode ? node : null);

        if (after)
            this.concatFormat(node, scope, after);
    }

    concatLeftParens(node, scope)
    {
        this.concatWithFormat(node, scope, "(", "left-parens");
    }

    concatRightParens(node, scope)
    {
        this.concatWithFormat(node, scope, ")", "right-parens");
    }

    concatComma(node, scope)
    {
        this.concatWithFormat(node, scope, ",", "comma");
    }

    concatOperator(node, scope, operator)
    {
        this.concatWithFormat(node, scope, operator || node.operator, "operator");
    }

    concatParenthesizedBlock(node, scope, func)
    {
        this.concatWithFormats(node, scope, "before-left-parens", "(", func ? "after-left-parens" : null);

        if (func)
            func();

        this.concatWithFormats(node, scope, func ? "before-left-parens" : null, ")", "after-left-parens");
    }

    concatBuffer(buffer)
    {
        this.atoms.push(...buffer.atoms);
        this.locations.push(...buffer.locations);
    }

    isEmpty()
    {
        return this.atoms.length === 0;
    }
}

StringBuffer.RECEIVER_TEMP_VAR = "___r";

module.exports = StringBuffer;
