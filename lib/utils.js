"use strict";

const
    fs = require("fs"),
    path = require("path");

exports.readSource = sourcePath =>
{
    let source;

    try
    {
        source = fs.readFileSync(sourcePath, "utf8");
    }
    catch (e)
    {
        let error;

        switch (e.code)
        {
            case "ENOENT":
                error = `no such file '${sourcePath}'`;
                break;

            case "EISDIR":
                error = `'${sourcePath}' is a directory`;
                break;

            // istanbul ignore next: failsafe
            default:
                error = `could not read file (${e.message})`;
        }

        throw new Error(error);
    }

    return source;
};

/**
 * Convert an absolute path to a relative path.
 *
 * @param {string} sourcePath - Path to convert.
 * @returns {string} - Converted path.
 */
exports.getRelativeSourcePath = function(sourcePath)
{
    if (sourcePath === "<stdin>")
        return sourcePath;

    let relativePath = path.relative(process.cwd(), sourcePath);

    // If the relative path has more than two successive .. motions, make it absolute.
    // istanbul ignore next: I've tested this manually and I'm satisfied it works
    if (/^\.\.[/\\]\.\.[/\\]\.\./.test(relativePath))
        relativePath = path.resolve(relativePath);

    return relativePath;
};

/**
    When storing nodes for later reference, we don't want to store
    the whole thing, because this would not allow child nodes to
    be garbage collected. So we copy only the info that we need.

    @param {acorn.Node} node - Node to copy info from.
    @returns {Object} - New object with relevant node info.
 */
exports.copyNode = function(node)
{
    return {
        type: node.type,
        name: node.name,
        start: node.start,
        end: node.end,
        loc: node.loc,
        objj: node.objj,
        sourceFile: node.sourceFile
    };
};
