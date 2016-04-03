"use strict";

const lodashTemplate = require("lodash.template");

exports.makeTemplate = text => lodashTemplate(text, { variable: "data" });
