import fs from 'fs';
import util from 'util';
import zlib from 'zlib';
import adler32 from 'adler32';
import xml2js from 'xml2js';
import debug from 'debug';

const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

function _fast_decrypt(data, key) {
  const b = Buffer.alloc(data.length);
  data.copy(b);
  let previous = 0x36;
  for (var i = 0; i < b.length; i++) {
    let t = (b[i] >> 4 | b[i] << 4) & 0xff;
    t = t ^ previous ^ (i & 0xff) ^ key[i % key.length];
    previous = b[i];
    b[i] = t;
  }
  return b;
}

function ripemd128(message) {
  // 初始化哈希值
  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;

  // 消息填充和分组
  const X = padAndSplit(message);

  // 主循环
  for (let i = 0; i < X.length; i++) {
    let A = h0;
    let B = h1;
    let C = h2;
    let D = h3;
    let Ap = h0;
    let Bp = h1;
    let Cp = h2;
    let Dp = h3;

    for (let j = 0; j < 64; j++) {
      const T = rol(s[j], add(A, f(j, B, C, D), X[i][r[j]], K(j)));
      [A, D, C, B] = [D, C, B, T];
      
      const Tp = rol(sp[j], add(Ap, f(63 - j, Bp, Cp, Dp), X[i][rp[j]], Kp(j)));
      [Ap, Dp, Cp, Bp] = [Dp, Cp, Bp, Tp];
    }

    const T = add(h1, C, Dp);
    h1 = add(h2, D, Ap);
    h2 = add(h3, A, Bp);
    h3 = add(h0, B, Cp);
    h0 = T;
  }

  // 将结果打包为 Buffer
  const result = Buffer.alloc(16);
  result.writeUInt32LE(h0, 0);
  result.writeUInt32LE(h1, 4);
  result.writeUInt32LE(h2, 8);
  result.writeUInt32LE(h3, 12);
  return result;
}

// 辅助函数
function rol(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function add(...args) {
  return args.reduce((a, b) => (a + b) >>> 0, 0);
}

function f(j, x, y, z) {
  if (j < 16) return x ^ y ^ z;
  if (j < 32) return (x & y) | (~x & z);
  if (j < 48) return (x | ~y) ^ z;
  return (x & z) | (y & ~z);
}

function K(j) {
  if (j < 16) return 0x00000000;
  if (j < 32) return 0x5A827999;
  if (j < 48) return 0x6ED9EBA1;
  return 0x8F1BBCDC;
}

function Kp(j) {
  if (j < 16) return 0x50A28BE6;
  if (j < 32) return 0x5C4DD124;
  if (j < 48) return 0x6D703EF3;
  return 0x00000000;
}

// ROL 常量
const s = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12
];

const sp = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8
];

// 消息填充和分组函数
function padAndSplit(message) {
  const msgBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);
  const msgLen = msgBuffer.length;
  // 计算填充长度，确保是 512 位的倍数
  const padLen = Math.floor((448 - (msgLen * 8 + 1) % 512) / 8);
  // 确保总长度是 64 字节（512位）的倍数
  const totalLen = Math.ceil((msgLen + padLen + 8) / 64) * 64;
  
  const padded = Buffer.alloc(totalLen);
  msgBuffer.copy(padded);
  padded[msgLen] = 0x80;
  
  // 添加消息长度（以位为单位）
  const bitLen = msgLen * 8;
  padded.writeBigUInt64LE(BigInt(bitLen), totalLen - 8);
  
  // 将填充后的消息分成 512 位的块
  const blocks = [];
  for (let i = 0; i < totalLen; i += 64) {
    const block = [];
    for (let j = 0; j < 64; j += 4) {
      if (i + j + 4 <= totalLen) {  // 添加边界检查
        block.push(padded.readUInt32LE(i + j));
      }
    }
    blocks.push(block);
  }
  
  return blocks;
}

// 消息块索引
const r = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2
];

const rp = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14
];

/**
 * 
 * @param {Buffer} buff 
 * @param {number} start 
 * @param {Buffer} delimiter 
 * @returns 
 */
function findDelimiter(buff, start, delimiter) {
  let offset = start;
  while (offset < buff.byteLength) {
    if (buff.subarray(offset, offset + delimiter.byteLength).compare(delimiter) === 0) {
      return offset;
    }
    offset += delimiter.byteLength;
  }
}

export class Dict {

  constructor(filename, headerKey) {
    this.filename = filename;
    this.headerKey = headerKey;
    this.meta = {};
  }

  async readHeader() {
    const fd = await open(this.filename, 'r');
    // header bytes size
    const buf = Buffer.allocUnsafe(4);
    await read(fd, buf);
    const headerBytesSize = buf.readInt32BE(0);
    // header bytes
    const headerBytes = Buffer.allocUnsafe(headerBytesSize);
    await read(fd, headerBytes);
    // checksum
    const checksum = Buffer.allocUnsafe(4);
    await read(fd, checksum);

    if ((adler32.sum(headerBytes) & 0xffffffff) !== checksum.readInt32LE(0)) {
      throw new Error(`mdx: header checksum failed`);
    }

    const header = headerBytes.subarray(0, -2).toString('utf16le');
    debug('header tags: %s', header);
    const parser = new xml2js.Parser();
    const parsed = await parser.parseStringPromise(header);
    const $ = parsed[this.headerKey].$;

    this.meta.version = $.GeneratedByEngineVersion;
    this.meta.required = $.RequiredEngineVersion;
    this.meta.format = $.Format;
    this.meta.keyCaseSensitive = $.KeyCaseSensitive;
    this.meta.stripKey = $.StripKey;
    // encryption flag
    //  0x00 - no encryption
    //  0x01 - encrypt record block
    //  0x02 - encrypt key info block
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

    // header bytes size + header bytes + checksum
    this.keyBlockOffset = 4 + headerBytesSize + 4;
    debug('key block offset: %s', this.keyBlockOffset);
    await close(fd);
  }

  decodeKeyBlockInfo(compressed) {
    debug('start to decode key block info.');
    if (compressed.subarray(0, 4).compare(Buffer.from([0x02, 0x00, 0x00, 0x00])) !== 0) {
      throw new Error(`mdx: the key block info is not compacted.`);
    }

    if (this.meta.encrypted === 2) {
      // key = ripemd128(comp_block[4:8] + pack(b'<L', 0x3695))
      const message = Buffer.concat([
        compressed.subarray(4, 8),
        Buffer.from([0x36, 0x95, 0x00, 0x00])  // 修复：确保是 4 字节
      ]);
      const key = ripemd128(message);
      const decrypted = _fast_decrypt(compressed.subarray(8), key);
      compressed = Buffer.concat([compressed.subarray(0, 8), decrypted]);
    }

    const checksum = compressed.subarray(4, 8);
    const decompressed = zlib.unzipSync(compressed.subarray(8));
    
    if ((adler32.sum(decompressed) & 0xffffffff) !== checksum.readInt32BE(0)) {
      throw new Error(`mdx: key block info checksum failed`);
    }

    const keyBlockInfoList = [];
    let numOfEntries = 0;
    let i = 0;

    const encoding = this.meta.encoding === 'UTF-8' ? 'utf-8' : 'utf16le';

    while (i < decompressed.byteLength) {
      // number of entries in current key block
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
      debug('');
      // key block compressed size
      const keyBlockCompressedSize = Number(decompressed.readBigUint64BE(i));
      i += 8;
      // key block decompressed size
      const keyBlockDecompressedSize = Number(decompressed.readBigUint64BE(i));
      i += 8;
      keyBlockInfoList.push([keyBlockCompressedSize, keyBlockDecompressedSize]);
      debug('compressed: %s, decompressed: %s', keyBlockCompressedSize, keyBlockDecompressedSize);
    }

    if (numOfEntries !== this.numOfEntries) {
      throw new Error(`mdx: the number of entries is mismatch`);
    }

    return keyBlockInfoList;
  }

  decodeKeyBlock(compressed, keyBlockInfoList) {
    const keyList = [];
    let i = 0;
    for (const [compressedSize, decompressedSize] of keyBlockInfoList) {
      const keyBlockType = compressed.subarray(i, i + 4);
      const compressedBytes = compressed.subarray(i + 8, i + compressedSize);
      const keyBlockBytes = zlib.unzipSync(compressedBytes);
      const checksum = compressed.readInt32BE(i + 4);
      if ((adler32.sum(keyBlockBytes) & 0xffffffff) !== checksum) {
        throw new Error(`mdx: key block checksum failed`);
      }
      i += compressedSize;
      keyList.push(...this.splitKeyBlock(keyBlockBytes));
    }
    return keyList;
  }

  async readKeys() {
    const fd = await open(this.filename, 'r');
    const position = this.keyBlockOffset;
    const keyBlockBytes = Buffer.allocUnsafe(40);
    await read(fd, keyBlockBytes, { position });
    // number of key blocks
    this.numOfKeyBlocks = Number(keyBlockBytes.readBigUint64BE(0));
    // number of entries
    this.numOfEntries = Number(keyBlockBytes.readBigUint64BE(8));
    // number of bytes of key block info after decompression
    this.numOfKeyBlockInfoBytes = keyBlockBytes.readBigUint64BE(16);
    // number of bytes of key block info
    const keyBlockInfoSize = Number(keyBlockBytes.readBigUint64BE(24));
    debug('number of bytes of key block info: ', keyBlockInfoSize);
    // number of bytes of key block
    const keyBlockCompressedSize = keyBlockBytes.readBigUint64BE(32);

    // checksum for key blocks
    const checksum = Buffer.allocUnsafe(4);
    await read(fd, checksum, { position: position + 40 });
    if ((adler32.sum(keyBlockBytes) & 0xffffffff) !== checksum.readInt32BE(0)) {
      throw new Error(`mdx: key block checksum failed`);
    }

    const keyBlockInfoBytes = Buffer.allocUnsafe(keyBlockInfoSize);
    await read(fd, keyBlockInfoBytes, { position: position + 44 });

    const keyBlockInfoList = this.decodeKeyBlockInfo(keyBlockInfoBytes);
    if (keyBlockInfoList.length !== this.numOfKeyBlocks) {
      throw new Error(`mdx: the number of key blocks is mismatch`);
    }
    
    const keyBlockListCompressedBytes = Buffer.allocUnsafe(Number(keyBlockCompressedSize));
    await read(fd, keyBlockListCompressedBytes, { position: position + 44 + keyBlockInfoBytes.byteLength });
    const keyList = this.decodeKeyBlock(keyBlockListCompressedBytes, keyBlockInfoList);
    this.recordBlockOffset = position + 44 + keyBlockInfoBytes.byteLength + keyBlockListCompressedBytes.byteLength;
    await close(fd);
    return keyList;
  }
    
  async build() {
    await this.readHeader();
    if (this.meta.version !== '2.0') {
      throw new Error(`mdx: current support 2.0 only.`);
    }
    this.keyList = await this.readKeys();
  }

  /**
     * 
     * @param {Buffer} keyBlockBytes 
     * @returns 
     */
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
}
