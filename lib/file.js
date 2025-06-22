import fs from 'fs';
import util from 'util';
import Debug from 'debug';
import assert from 'assert';
import zlib from 'zlib';
import { Buffer } from 'buffer';

import adler32 from 'adler32';
import xml2js from 'xml2js';

import { fastDecrypt, findDelimiter } from './util.js';
import { ripemd128 } from './ripemd128.js';

const debug = Debug('mdict:file');

const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

export class File {
  constructor(filename, headerKey) {
    this.filename = filename;
    this.headerKey = headerKey;
    this.meta = {};
    this.keyBlockOffset = 0;
  }

  async readHeader() {
    const fd = await open(this.filename, 'r');
    try {
      // 读取头部字节大小
      const buf = Buffer.allocUnsafe(4);
      await read(fd, buf);
      const headerBytesSize = buf.readInt32BE(0);
      debug(`header bytes size: ${headerBytesSize}`);
      // 读取头部字节
      const headerBytes = Buffer.allocUnsafe(headerBytesSize);
      await read(fd, headerBytes);

      // 读取校验和
      const checksumBytes = Buffer.allocUnsafe(4);
      await read(fd, checksumBytes);
      const checksum = checksumBytes.readInt32LE(0);
      // 验证校验和
      if ((adler32.sum(headerBytes) & 0xffffffff) !== checksum) {
        throw new Error('header checksum failed');
      }

      // 解析 XML 头部
      const header = headerBytes.subarray(0, -2).toString('utf16le');
      debug('header string: %s', header);
      const parser = new xml2js.Parser();
      const parsed = await parser.parseStringPromise(header);
      const $ = parsed[this.headerKey].$;

      // 验证版本
      if ($.GeneratedByEngineVersion !== '2.0') {
        throw new Error('current support 2.0 only.');
      }

      // 设置元数据
      this.meta.version = $.GeneratedByEngineVersion;
      this.meta.required = $.RequiredEngineVersion;
      this.meta.format = $.Format;
      this.meta.keyCaseSensitive = $.KeyCaseSensitive === 'Yes' ? '1' : '0';
      this.meta.stripKey = $.StripKey === 'Yes' ? '1' : '0';
      this.meta.encrypted = Number($.Encrypted);
      this.meta.registerBy = $.RegisterBy;
      this.meta.description = $.Description;
      this.meta.title = $.Title;
      this.meta.encoding = $.Encoding;
      this.meta.creationDate = $.CreationDate;
      this.meta.compact = $.Compact;
      this.meta.compat = $.Compat;
      this.meta.left2right = $.Left2Right;
      this.meta.dataSourceFormat = $.DataSourceFormat;
      this.meta.styleSheet = $.StyleSheet;

      // 记录关键字块的偏移量
      this.keyBlockOffset = 4 + headerBytesSize + 4;
    } finally {
      await close(fd);
    }
  }

  async readKeys() {
    const fd = await open(this.filename, 'r');
    const position = this.keyBlockOffset;
    const keyBlockBytes = Buffer.allocUnsafe(40);
    await read(fd, keyBlockBytes, { position });
    // number of key blocks
    this.numOfKeyBlocks = Number(keyBlockBytes.readBigUint64BE(0));
    debug('number of key blocks: %s', this.numOfKeyBlocks);
    // number of entries
    this.numOfEntries = Number(keyBlockBytes.readBigUint64BE(8));
    debug('number of entries: %s', this.numOfEntries);
    // number of bytes of key block info after decompression
    this.numOfKeyBlockInfoBytes = keyBlockBytes.readBigUint64BE(16);
    debug('number of bytes of key block info after decompression: %s', this.numOfKeyBlockInfoBytes);
    // number of bytes of key block info
    const keyBlockInfoSize = Number(keyBlockBytes.readBigUint64BE(24));
    debug('number of bytes of key block info: ', keyBlockInfoSize);
    // number of bytes of key block
    const keyBlockCompressedSize = Number(keyBlockBytes.readBigUint64BE(32));
    debug('number of bytes of key block: ', keyBlockCompressedSize);

    // checksum for key blocks
    const checksum = Buffer.allocUnsafe(4);
    await read(fd, checksum, { position: position + 40 });
    if ((adler32.sum(keyBlockBytes) & 0xffffffff) !== checksum.readInt32BE(0)) {
      throw new Error(`key block checksum failed`);
    }

    // read key block info
    const keyBlockInfoBytes = Buffer.allocUnsafe(keyBlockInfoSize);
    await read(fd, keyBlockInfoBytes, { position: position + 44 });

    const keyBlockInfoList = this.decodeKeyBlockInfo(keyBlockInfoBytes);
    if (keyBlockInfoList.length !== this.numOfKeyBlocks) {
      throw new Error(`the number of key blocks is mismatch`);
    }
    debug('start to decode key block.');
    const keyBlockCompressedBytes = Buffer.allocUnsafe(keyBlockCompressedSize);
    await read(fd, keyBlockCompressedBytes, { position: position + 44 + keyBlockInfoSize });
    const keyList = this.decodeKeyBlock(keyBlockCompressedBytes, keyBlockInfoList);
    this.recordBlockOffset = position + 44 + keyBlockInfoSize + keyBlockCompressedSize;
    return keyList;
  }

  async build() {
    await this.readHeader();
    if (this.meta.version !== '2.0') {
      throw new Error(`current support 2.0 only.`);
    }
    this.keyList = await this.readKeys();
  }

  decodeKeyBlock(compressed, keyBlockInfoList) {
    const keyList = [];
    let i = 0;
    for (const [compressedSize] of keyBlockInfoList) {
      const keyBlockType = compressed.subarray(i, i + 4);
      if (keyBlockType.compare(Buffer.from([0x02, 0x00, 0x00, 0x00])) !== 0) {
        throw new Error(`the key block info is not compacted.`);
      }
      const compressedBytes = compressed.subarray(i + 8, i + compressedSize);
      const keyBlockBytes = zlib.unzipSync(compressedBytes);
      const checksum = compressed.readInt32BE(i + 4);
      if ((adler32.sum(keyBlockBytes) & 0xffffffff) !== checksum) {
        throw new Error(`mdd: key block checksum failed`);
      }
      i += compressedSize;
      keyList.push(...this.splitKeyBlock(keyBlockBytes));
    }
    return keyList;
  }

  splitKeyBlock(keyBlockBytes) {
    const encoding = this.meta.encoding === 'UTF-8' ? 'utf8' : 'utf16le';
    const delimiter = encoding === 'utf8' ? Buffer.from([0x00]) : Buffer.from([0x00, 0x00]);
    const keyList = [];
    let start = 0;

    while (start < keyBlockBytes.byteLength) {
      const keyId = Number(keyBlockBytes.readBigUint64BE(start));
      start += 8;
      const endIndex = findDelimiter(keyBlockBytes, start, delimiter);
      const keyTextBytes = keyBlockBytes.subarray(start, endIndex);
      const keyText = keyTextBytes.toString(encoding).trim();
      start = endIndex + delimiter.byteLength;
      debug('key id: %s, key text: %s', keyId, keyText);
      keyList.push([keyId, keyText]);
    }
    return keyList;
  }

  decodeKeyBlockInfo(compressed) {
    debug('start to decode key block info.');
    if (compressed.subarray(0, 4).compare(Buffer.from([0x02, 0x00, 0x00, 0x00])) !== 0) {
      throw new Error(`the key block info is not compacted.`);
    }

    if (this.meta.encrypted & 0x02) {
      const message = Buffer.concat([
        compressed.subarray(4, 8),
        Buffer.from([0x95, 0x36, 0x00, 0x00])
      ]);
      const key = ripemd128(message);
      compressed = Buffer.concat([compressed.subarray(0, 8), fastDecrypt(compressed.subarray(8), key)]);
    }

    const checksum = compressed.subarray(4, 8);
    const decompressed = zlib.unzipSync(compressed.subarray(8));

    if ((adler32.sum(decompressed) & 0xffffffff) !== checksum.readInt32BE(0)) {
      throw new Error(`mdd: key block info checksum failed`);
    }

    const keyBlockInfoList = [];
    let numOfEntries = 0;
    let i = 0;

    const encoding = this.meta.encoding === 'UTF-8' ? 'utf-8' : 'utf16le';

    while (i < decompressed.byteLength) {
      numOfEntries += Number(decompressed.readBigUint64BE(i));
      i += 8;

      const textHeadSize = decompressed.readUint16BE(i);
      i += 2;

      if (encoding === 'utf16le') {
        i += (textHeadSize + 1) * 2;
      } else {
        i += textHeadSize + 1;
      }

      const textTailSize = decompressed.readUint16BE(i);
      i += 2;

      if (encoding === 'utf16le') {
        i += (textTailSize + 1) * 2;
      } else {
        i += textTailSize + 1;
      }

      const keyBlockCompressedSize = Number(decompressed.readBigUint64BE(i));
      i += 8;
      const keyBlockDecompressedSize = Number(decompressed.readBigUint64BE(i));
      i += 8;
      keyBlockInfoList.push([keyBlockCompressedSize, keyBlockDecompressedSize]);
      debug('compressed: %s, decompressed: %s', keyBlockCompressedSize, keyBlockDecompressedSize);
    }

    if (numOfEntries !== this.numOfEntries) {
      throw new Error(`mdd: the number of entries is mismatch`);
    }

    return keyBlockInfoList;
  }

  async index() {
    const fd = await open(this.filename, 'r');
    const position = this.recordBlockOffset;
    const indexDicts = [];
    const recordHeaderBytes = Buffer.allocUnsafe(32);
    await read(fd, recordHeaderBytes, { position: position });

    const numOfRecordBlocks = Number(recordHeaderBytes.readBigUint64BE(0));
    debug('number of record blocks: %s', numOfRecordBlocks);
    const numOfEntries = Number(recordHeaderBytes.readBigUint64BE(8));
    debug('number of entries: %s', numOfEntries);
    if (numOfEntries !== this.numOfEntries) {
      throw new Error('mdd: number of entries mismatched');
    }

    const recordBlockInfoSize = Number(recordHeaderBytes.readBigUint64BE(16));
    debug('size of record block info: %s', recordBlockInfoSize);
    const recordBlockSize = Number(recordHeaderBytes.readBigUint64BE(24));
    debug('size of record block: %s', recordBlockSize);

    const recordBlockInfoBytes = Buffer.allocUnsafe(numOfRecordBlocks * 16);
    await read(fd, recordBlockInfoBytes, { position: position + 32 });

    const recordBlockInfoList = [];
    for (let i = 0; i < numOfRecordBlocks; i++) {
      const compressedSize = Number(recordBlockInfoBytes.readBigUint64BE(i * 16));
      const decompressedSize = Number(recordBlockInfoBytes.readBigUint64BE(i * 16 + 8));
      recordBlockInfoList.push([compressedSize, decompressedSize]);
    }

    if (recordBlockInfoSize !== numOfRecordBlocks * 16) {
      throw new Error(`mdd: record block info size is mismatch`);
    }

    let newPosition = position + 32 + recordBlockInfoSize;
    let offset = 0;
    let i = 0;
    for (const [compressedSize, decompressedSize] of recordBlockInfoList) {
      const compressedBytes = Buffer.allocUnsafe(compressedSize);
      await read(fd, compressedBytes, { position: newPosition });

      const recordBlockType = compressedBytes.subarray(0, 4);
      const checksum = compressedBytes.readInt32BE(4);

      while (i < this.keyList.length) {
        const dict = {};
        dict['file_pos'] = newPosition;
        dict['compressed_size'] = compressedSize;
        dict['decompressed_size'] = decompressedSize;
        dict['record_block_type'] = recordBlockType.readUInt32LE(0);
        const [start, keyText] = this.keyList[i];
        dict['record_start'] = start;
        dict['key_text'] = keyText.toString();
        dict['offset'] = offset;
        
        if (start - offset >= decompressedSize) {
          break;
        }
        
        let end;
        if (i < this.keyList.length - 1) {
          end = this.keyList[i + 1][0];
        } else {
          end = decompressedSize + offset;
        }
        dict['record_end'] = end;
        i += 1;
        indexDicts.push(dict);
      }
      offset += decompressedSize;
      newPosition += compressedSize;
    }

    await close(fd);

    this.indexDicts = indexDicts;
    return indexDicts;
  }

  async lookup(index) {
    const fd = await open(this.filename, 'r');
    const position = index.file_pos;
    const compressedBytes = Buffer.allocUnsafe(index.compressed_size);
    await read(fd, compressedBytes, { position });
    const recordBlockType = compressedBytes.readUint32LE(0);
    assert.strictEqual(recordBlockType, index.record_block_type);
    let decompressedBytes;
    if (recordBlockType === 0x02) {
      decompressedBytes = zlib.unzipSync(compressedBytes.subarray(8));
    }
    return decompressedBytes.subarray(index.record_start - index.offset, index.record_end - index.offset);
  }
}
