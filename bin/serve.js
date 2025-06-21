#!/usr/bin/env node

import http from 'http';
import url from 'url';
import process from 'process';
import { Buffer } from 'buffer';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { stat } from 'fs/promises';

import MDict from '../lib/mdict.js';

const exists = promisify(fs.exists);

const getMimeType = (function () {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
  };

  return function (filename) {
    const ext = path.extname(filename);
    return types[ext] || 'application/octet-stream';
  };
})();

const [mdxPath, mddPath, portStr] = process.argv.slice(2);

if (!mdxPath) {
  console.error('mdx path is required');
  console.log('Usage: mdict-serve <mdx> <mdd> <port>');
  process.exit(1);
}

const port = Number(portStr) || 8989;

const mdict = new MDict({mdx: mdxPath, mdd: mddPath});

const dictDir = path.dirname(mdxPath);

const {mdx: mdxIndex, mdd: mddIndex} = await mdict.buildIndex();

const wordMap = mdxIndex.reduceRight((pre, cur) => {
  pre.set(cur.key_text, cur);
  return pre;
}, new Map());

const words = [...wordMap.keys()];

const resourceMap = mddIndex ? mddIndex.reduceRight((pre, cur) => {
  pre.set(cur.key_text, cur);
  return pre;
}, new Map()) : new Map();

function tpl(snippet) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
  #header {
    width: 1230px;
    margin: 0 auto;
  }
  #page {
    width: 960px;
    margin: 0 auto;
    padding: 20px;
  }
  </style>
</head>
<body>
  <div id="header">
    <a href="/">HOME</a>
  </div>
  <div id="page">${snippet}</div>
</body>
</html>`
}

const homepage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  <style>
  #header {
    width: 1230px;
    margin: 0 auto;
  }
  #page {
    width: 1230px;
    margin: 0 auto;
    padding: 20px;
  }
  .word-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    list-style: none;
    padding: 0;
  }
  .word-list li {
  }
  .word-list a {

  }
  .word-list a:hover {
    background-color: #f0f0f0;
  }
  </style>
</head>
<body>
  <div id="header">
    <a href="/">HOME</a>
  </div>
  <div id="page">
    <ul class="word-list">
    ${words.map((d) => {
      return `<li><a href="/search?word=${d}">${d}</a></li>`;
    }).join('')}
    </ul>
  </div>
</body>
</html>`;

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.path === '/favicon.ico') {
    res.writeHead(404);
    res.end();
    return;
  }

  (async () => {
    if (parsed.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html;charset=utf-8',
        'content-length': Buffer.byteLength(homepage)
      });
      res.write(homepage);
      res.end();
      return;
    }

    if (parsed.pathname === '/search') {
      const word = parsed.query.word;
      const found = wordMap.get(word);

      if (found) {
        const result = await mdict.mdx.lookup(found);
        const content = result.toString().trim();
        if (content.startsWith('@@@LINK=')) {
          res.writeHead(302, {
            'location': `/search?word=${content.substring(8, content.length - 3)}`
          });
          res.end();
          return;
        }

        const page = tpl(result.toString().replace(/entry:\/\//g, '/search?word='));
        res.writeHead(200, {
          'Content-Type': 'text/html;charset=utf-8',
          'content-length': Buffer.byteLength(page)
        });
        res.write(page);
        res.end();
        return;
      }

      res.writeHead(404);
      res.end(`The word(${word}) not found`);
      return;
    }

    const pathname = parsed.pathname;
    const key = pathname.replaceAll('/', '\\');
    const found = resourceMap.get(key);
    if (found) {
      const result = await mdict.mdd.lookup(found);
      res.writeHead(200, {
        'Content-Type': 'text/html;charset=utf-8',
        'Content-Length': Buffer.byteLength(result)
      });
      res.write(result);
      res.end();
      return;
    }

    // other static files
    const staticFilePath = path.join(dictDir, pathname);
    if (await exists(staticFilePath)) {
      const result = await stat(staticFilePath);
      res.writeHead(200, {
        'Content-Type': getMimeType(staticFilePath),
        'Content-Length': result.size
      });
      fs.createReadStream(staticFilePath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end();
  })();

}).listen(port);
