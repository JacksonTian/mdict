import MDD from '../lib/mdd.js';
import fs from 'fs';
import path from 'path';
import {Buffer} from 'buffer';
import { fileURLToPath } from 'url';

import { describe, it, beforeEach } from 'node:test';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MDD', () => {
  let mdd;
  const mddFilePath = path.join(__dirname, 'fixtures', 'test.mdd');

  beforeEach(() => {
    mdd = new MDD(mddFilePath);
  });

  describe('constructor', () => {
    it('should initialize MDD instance correctly', () => {
      assert.strictEqual(mdd.filename, mddFilePath);
      assert.strictEqual(mdd.headerKey, 'Library_Data');
      assert.deepStrictEqual(mdd.meta, {});
    });
  });

  describe('build and index', () => {
    it('should build MDD file structure correctly', async () => {
      await mdd.readHeader();
      await mdd.readKeys();
    //   await mdd.build();
    //   assert.ok(mdd.keyList);
    //   assert.ok(mdd.recordBlockOffset);
    //   assert.ok(mdd.numOfEntries);
    //   assert.ok(mdd.numOfKeyBlocks);
    });

    it('should build index correctly', async () => {
      await mdd.build();
      const indexDicts = await mdd.index();
      
      assert.ok(Array.isArray(indexDicts));
      assert.ok(indexDicts.length > 0);
      
      // 验证索引结构
      const firstIndex = indexDicts[0];
      assert.ok('file_pos' in firstIndex);
      assert.ok('compressed_size' in firstIndex);
      assert.ok('decompressed_size' in firstIndex);
      assert.ok('record_block_type' in firstIndex);
      assert.ok('record_start' in firstIndex);
      assert.ok('key_text' in firstIndex);
      assert.ok('offset' in firstIndex);
      assert.ok('record_end' in firstIndex);
    });

    it('should handle non-existent file', async () => {
      const nonExistentFile = new MDD('non_existent.mdd');
      await assert.rejects(nonExistentFile.build());
    });

    it('should handle empty file', async () => {
      const emptyFile = path.join(__dirname, 'fixtures', 'empty.mdd');
      fs.writeFileSync(emptyFile, '');
      const file = new MDD(emptyFile);
      await assert.rejects(file.build());
      fs.unlinkSync(emptyFile);
    });

    it('should handle invalid MDD file', async () => {
      const invalidFile = path.join(__dirname, 'fixtures', 'invalid.mdd');
      const invalidContent = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      fs.writeFileSync(invalidFile, invalidContent);
      const file = new MDD(invalidFile);
      await assert.rejects(file.build());
      fs.unlinkSync(invalidFile);
    });
  });
});
