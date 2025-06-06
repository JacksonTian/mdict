import { File } from '../lib/file.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('File', () => {
  let mdx, mdd;
  const mdxFilePath = path.join(__dirname, 'fixtures', 'test.mdx');
  const mddFilePath = path.join(__dirname, 'fixtures', 'test.mdd');
  const mdxHeaderKey = 'Dictionary';
  const mddHeaderKey = 'Library_Data';

  beforeEach(() => {
    mdx = new File(mdxFilePath, mdxHeaderKey);
    mdd = new File(mddFilePath, mddHeaderKey);
  });

  describe('constructor', () => {
    it('should initialize File instance correctly', () => {
      assert.strictEqual(mdx.filename, mdxFilePath);
      assert.strictEqual(mdx.headerKey, mdxHeaderKey);
      assert.deepStrictEqual(mdx.meta, {});
    });
  });

  describe('file operations', () => {
    it('should read MDX file header correctly', async () => {
      await mdx.readHeader();
      console.log(mdx.meta);
      assert.strictEqual(mdx.meta.version, '2.0');
      assert.strictEqual(mdx.meta.required, '2.0');
      assert.strictEqual(mdx.meta.format, 'Html');
      assert.strictEqual(mdx.meta.keyCaseSensitive, '0');
      assert.strictEqual(mdx.meta.stripKey, '1');
      assert.strictEqual(mdx.meta.encrypted, 2);
      assert.strictEqual(mdx.meta.encoding, 'UTF-8');
      assert.strictEqual(mdx.meta.compact, 'No');
      assert.strictEqual(mdx.meta.compat, 'No');
      assert.strictEqual(mdx.meta.left2right, 'Yes');
      assert.strictEqual(mdx.meta.dataSourceFormat, '107');
      assert.strictEqual(mdx.meta.styleSheet, '');
    });

    it('should handle non-existent file', async () => {
      const nonExistentFile = new File('non_existent.mdx', mdxHeaderKey);
      await assert.rejects(nonExistentFile.readHeader());
    });

    it('should handle empty file', async () => {
      const emptyFile = path.join(__dirname, 'fixtures', 'empty.mdx');
      fs.writeFileSync(emptyFile, '');
      const file = new File(emptyFile, mdxHeaderKey);
      await assert.rejects(file.readHeader());
      fs.unlinkSync(emptyFile);
    });

    it('should handle invalid MDX file', async () => {
      const invalidFile = path.join(__dirname, 'fixtures', 'invalid.mdx');
      const invalidContent = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      fs.writeFileSync(invalidFile, invalidContent);
      const file = new File(invalidFile, mdxHeaderKey);
      await assert.rejects(file.readHeader());
      fs.unlinkSync(invalidFile);
    });

    it('should handle MDD file correctly', async () => {
      await mdd.readHeader();
      console.log(mdd.meta);
      assert.strictEqual(mdd.meta.version, '2.0');
      assert.strictEqual(mdd.meta.required, '2.0');
      assert.strictEqual(mdd.meta.format, '');
      assert.strictEqual(mdd.meta.encrypted, 2);
    });
  });
});
