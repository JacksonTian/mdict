#!/usr/bin/env node


import http from 'http';
import url from 'url';
import fs from 'fs/promises';
import path from 'path';

import MDX from '../lib/mdx.js';

const [filepath] = process.argv.slice(2);

const mdx = new MDX(filepath);
await mdx.build();
const index = await mdx.index();
const map = index.reduceRight((pre, cur) => {
  pre.set(cur.key_text, cur);
  return pre;
}, new Map());

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.path === '/favicon.ico') {
    res.writeHead(404);
    res.end();
    return;
  }

  (async () => {
    if (parsed.pathname === '/all') {
      res.writeHead(200, {
        'Content-Type': 'plain/text'
      });
      for (const [key, value] of map) {
        res.write(key.toString() + '\n');
      }

      res.end();
      return;
    }

    if (parsed.pathname === '/mwa.css') {
      const content = await fs.readFile(path.join(filepath, '../mwa.css'));
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Content-Length': Buffer.byteLength(content)
      });

      res.end(content);
      return;
    }

    const word = parsed.query.word;
    const found = map.get(word);

    if (found) {
      const result = await mdx.lookup(found);
      console.log(result);
      res.writeHead(200, {
        'Content-Type': 'text/html;charset=utf-8',
        'Content-Length': Buffer.byteLength(result)
      });
      res.write(result);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  })();

}).listen(8989);
