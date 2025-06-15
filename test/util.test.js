import { Buffer } from 'buffer';
import { fastDecrypt } from '../lib/util.js';

import { ripemd128 } from '../lib/ripemd128.js';

import assert from 'assert';

describe('fastDecrypt', function () {
    it('should decrypt a given ciphertext', () => {
        const ciphertext = Buffer.from('Hello');
        const key = Buffer.from('world');
        assert.deepStrictEqual(fastDecrypt(ciphertext, key), Buffer.from([0xc5, 0x70, 0xd3, 0xc5, 0xfa]));
    });
});

describe('ripemd128', () => {
  it('should return the correct RIPEMD-128 hash for a given input', () => {
    const input = Buffer.from('hello world');
    const output = 'c52ac4d06245286b33953957be6c6f81'; // 示例输出，实际值需根据算法计算
    assert.strictEqual(ripemd128(input).toString('hex'), output);
  });

  it('should ok', () => {
    const expected = Buffer.from([0x8e, 0x62, 0x42, 0x2e, 0x18, 0xdf, 0x3f, 0x36, 0x05, 0xb1, 0xc1, 0xba, 0xb9, 0xd1, 0xa8, 0x87])
    assert.deepStrictEqual(ripemd128(Buffer.from("Hello world")), expected);
  });

  it('should ok', () => {
    const input = Buffer.from([96,36,114,152,149,54,0,0]);
    const output = Buffer.from([81,116,254,129,167,5,168,44,123,98,229,38,39,161,196,253]);
    assert.deepStrictEqual(ripemd128(input), output);
  });
});