"use strict";

const lodashTemplate = require("lodash.template");

exports.makeTemplate = function(text)
{
    return lodashTemplate(text, { variable: "data" });
};
