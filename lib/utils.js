"use strict";

var fs = require("fs"),
    lodashTemplate = require("lodash.template");

exports.makeTemplate = function(text)
{
    return lodashTemplate(text, { variable: "data" });
};

// Convert an array into a hash whose keys are the array elements and values are value || true.
// The hash has no prototype, so 'in' will work but not hasOwnProperty.
exports.arrayToHash = function(array, value)
{
    if (value === undefined)
        value = true;

    var hash = Object.create(null);

    for (var i = 0; i < array.length; i++)
        hash[array[i]] = value;

    return hash;
};

// From http://stackoverflow.com/a/16048083
exports.readStdin = function()
{
    var BUFSIZE = 256,
        buffer = new Buffer(BUFSIZE),
        text = "",
        bytesRead;

    process.stdin.setEncoding("utf8");

    // Loop as long as stdin input is available
    while (true)
    {
        bytesRead = 0;

        try
        {
            bytesRead = fs.readSync(process.stdin.fd, buffer, 0, BUFSIZE);
        }
        catch (ex)
        {
            if (ex.code === "EAGAIN")
            {
                // 'resource temporarily unavailable'
                // Happens on OS X 10.8.3 (not Windows 7!), if there's no
                // stdin input - typically when invoking a script without any
                // input (for interactive stdin input).
                // If you were to just continue, you'd create a tight loop.
                throw new Error("interactive stdin input not supported.");
            }
            else if (ex.code === "EOF")
            {
                // Happens on Windows 7, but not OS X 10.8.3:
                // simply signals the end of *piped* stdin input.
                break;
            }

            throw ex; // Unexpected exception
        }

        if (bytesRead === 0)
        {
            // No more stdin input available.
            // OS X 10.8.3: regardless of input method, this is how the end
            //   of input is signaled.
            // Windows 7: this is how the end of input is signaled for
            //   *interactive* stdin input.
            break;
        }

        // Process the chunk read.
        text += buffer.toString(null, 0, bytesRead);
    }

    return text;
};
