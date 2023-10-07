#!/usr/bin/env node


import MDD from '../lib/mdd.js';

const [filepath] = process.argv.slice(2);

const mdd = new MDD(filepath);
await mdd.build();
