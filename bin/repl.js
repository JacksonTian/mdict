#!/usr/bin/env node
import readline from 'readline';
import process from 'process';

import MDict from '../lib/mdict.js';

const [ mdxPath, mddPath ] = process.argv.slice(2);
if (!mdxPath) {
  console.error('用法: node bin/repl.js <mdx文件路径> [mdx文件路径]');
  process.exit(1);
}

const mdict = new MDict({
  mdx: mdxPath,
  mdd: mddPath
});

const {mdx: mdxIndex, mdd: mddIndex} = await mdict.buildIndex();
console.log(`载入词条：${mdxIndex.length}单词, 资源：${mddIndex.length} 个`);
const map = mdxIndex.reduceRight((pre, cur) => {
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
    const result = await mdict.mdx.lookup(found);
    console.log(result.toString());
  } else {
    console.log('未找到该单词。');
  }
  rl.prompt();
}).on('close', () => {
  console.log('再见！');
  process.exit(0);
});
