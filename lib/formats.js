/*
 * formats.j
 *
 * Created by Aparajita Fishman.
 * Copyright 2014, Aparajita Fishman.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the MIT license (http://opensource.org/licenses/MIT).
 */

"use strict";

var fs = require("fs"),
    path = require("path");

/*
    Load the format at the given path. If the path contains a directory
    separator, the file at the given path is loaded. Otherwise the named
    format is loaded from the formats directory. In either case, if the
    load is successful, the format specification object is returned.
    If there are errors, an Error is thrown.
*/
exports.load = function(formatPath)
{
    var filePath = formatPath,
        error = null;

    formatPath = null;

    if (filePath.indexOf(path.sep) >= 0)
    {
        // Load a user-supplied format
        filePath = path.resolve(filePath);

        if (fs.existsSync(filePath))
            formatPath = filePath;
        else
            error = "No file at the path: " + filePath;
    }
    else
    {
        // Load a standard format
        if (path.extname(filePath) === ".json")
            filePath = path.basename(filePath, ".json");

        formatPath = path.resolve(path.join(__dirname, "..", "formats", filePath + ".json"));

        if (!fs.existsSync(formatPath))
        {
            error = "No such format: \"" + filePath + "\"";

            // Be nice and show what formats *are* available
            formatPath = path.dirname(formatPath);

            var formats = fs.readdirSync(formatPath)
                            .filter(function(filename)
                            {
                                return /^.+\.json$/.test(filename);
                            })
                            .map(function(filename)
                            {
                                return path.basename(filename, path.extname(filename));
                            });

            error += "\nAvailable formats: " + formats.join(", ");
        }
    }

    var format = null;

    if (!error)
    {
        try
        {
            if (fs.statSync(formatPath).isFile())
                format = JSON.parse(fs.readFileSync(formatPath));
            else
                error = "Not a file: " + formatPath;
        }
        catch (e)
        {
            error = "Invalid JSON in format file: " + formatPath + "\n" + e.message;
        }
    }

    if (error)
        throw new Error(error);

    return format;
};
