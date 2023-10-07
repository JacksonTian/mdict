const fs = require('fs');
const util = require('util');
const zlib = require('zlib');

const adler32 = require('adler32');
const xml2js = require('xml2js');
const debug = require('debug')('mdx');

const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

function _fast_decrypt(data, key) {
  const b = Buffer.copyBytesFrom(data);
  let previous = 0x36;
  for (var i = 0; i < b.byteLength; i++) {
    let t = (b[i] >> 4 | b[i] << 4) & 0xff;
    t = t ^ previous ^ (i & 0xff) ^ key[i % len(key)];
    previous = b[i];
    b[i] = t;
  }
  return b;
}

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

class Dict {

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
      // return comp_block[0:8] + _fast_decrypt(comp_block[8:], key)
      const message = Buffer.concat([
        compressed.subarray(4, 8),
        Buffer.from([0x36, 0x95])
      ]);
      const key = ripemd128(message);
      compressed = Buffer.concat([compressed.subarray(0, 8), _fast_decrypt(compressed.subarray(8), key)]);
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

module.exports = Dict;
