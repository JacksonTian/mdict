#!/usr/bin/env node
import readline from 'readline';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import MDD from '../lib/mdd.js';
import process from 'process';
import path from 'path';

const [filepath] = process.argv.slice(2);

const mdd = new MDD(filepath);
await mdd.build();
const index = await mdd.index();
console.log(index);

const map = index.reduceRight((pre, cur) => {
    pre.set(cur.key_text, cur);
    return pre;
}, new Map());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '查词> '
});

console.log('MDX 词典 REPL 已启动，输入单词查询释义，输入 exit 退出。');
rl.prompt();

rl.on('line', async (line) => {
  const word = line.trim();
  if (word === 'exit') {
    rl.close();
    return;
  }

  if (word === '.random') {
    const keys = Array.from(map.keys());
    const randomIndex = Math.floor(Math.random() * keys.length);
    const randomWord = keys[randomIndex];
    console.log(randomWord);
    const record = map.get(randomWord);
    const bytes = await mdd.lookup(record);
    const filePath = path.join(process.cwd(), `output/${randomWord.replace(/\\/g, '/')}`);
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
      await mkdir(dirname, {
        recursive: true
      });
    }

    await writeFile(filePath, bytes);

    rl.prompt();
    return;
  }

  const found = map.get(word);
  if (found) {
    const result = await mdd.lookup(found);
    console.log(result);
  } else {
    console.log('未找到该单词。');
  }
  rl.prompt();
}).on('close', () => {
  console.log('再见！');
  process.exit(0);
});
