#!/usr/bin/env node

import { MDX } from '../lib/mdx.js';

const [filepath] = process.argv.slice(2);

const mdx = new MDX(filepath);
await mdx.build();
const index = await mdx.index();
console.log(index);
