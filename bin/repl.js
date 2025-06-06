#!/usr/bin/env node
import readline from 'readline';
import { MDX } from '../lib/mdx.js';

const [filepath] = process.argv.slice(2);
if (!filepath) {
  console.error('用法: node bin/repl.js <mdx文件路径>');
  process.exit(1);
}

const mdx = new MDX(filepath);
await mdx.build();
const index = await mdx.index();

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
    rl.prompt();
    return;
  }

  const found = map.get(word);
  if (found) {
    const result = await mdx.lookup(found);
    console.log(result);
  } else {
    console.log('未找到该单词。');
  }
  rl.prompt();
}).on('close', () => {
  console.log('再见！');
  process.exit(0);
});
