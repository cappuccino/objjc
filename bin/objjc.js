#!/usr/bin/env node
"use strict";

const cli = require("../lib/cli.js");

process.exit(cli.run(process.argv));
