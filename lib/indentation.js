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

    static indentString(string)
    {
        // First indent the beginning of each line that is not empty
        string = string.replace(/^\S/gm, Instance.indentation + "$&");

        // Finally replace tab placeholders with an indent step
        return string.replace(/→/g, Instance.indentStep);
    }
}

/**
 * @type {Indenter}
 */
module.exports = {
    indenter: Indenter.instance(),
    indentString: Indenter.indentString
};
