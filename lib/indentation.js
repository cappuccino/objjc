"use strict";

let Instance = null;

/**
 * Indenter
 */
class Indenter
{
    constructor()
    {
        this.indentString = "";
        this.indentWidth = 0;
        this.indentSize = this.indentWidth * this.indentString.length;
        this.indentStep = this.indentString.repeat(this.indentWidth);
        this.indentation = "";
    }

    /**
     * @returns {Indenter} - Singleton instance of this class
     */
    static instance()
    {
        // istanbul ignore else: just in case
        if (!Instance)
            Instance = new Indenter();

        return Instance;
    }

    setIndent(string, width)
    {
        this.indentString = string;
        this.indentWidth = width;
        this.indentSize = this.indentWidth * this.indentString.length;
        this.indentStep = this.indentString.repeat(this.indentWidth);
        this.indentation = "";
    }

    indent(count)
    {
        this.indentation += this.indentStep.repeat(count || 1);
    }

    dedent(count)
    {
        this.indentation = this.indentation.substring(this.indentSize * (count || 1));
    }

    static indentString(string, skipFirstLine)
    {
        // First indent the beginning of each line that is not empty
        const lines = string.split("\n");

        for (let i = skipFirstLine ? 1 : 0; i < lines.length; i++)
        {
            const line = lines[i];

            if (/\S/.test(line))
                lines[i] = Instance.indentation + lines[i];
        }

        // Finally replace tab placeholders with an indent step
        return lines.join("\n").replace(/→/g, Instance.indentStep);
    }
}

/**
 * @type {Indenter}
 */
module.exports = {
    indenter: Indenter.instance(),
    indentString: Indenter.indentString
};
