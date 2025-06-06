import fs from 'fs';
import util from 'util';
import adler32 from 'adler32';
import xml2js from 'xml2js';

const open = util.promisify(fs.open);
const read = util.promisify(fs.read);
const close = util.promisify(fs.close);

export class File {
  constructor(filename, headerKey) {
    this.filename = filename;
    this.headerKey = headerKey;
    this.meta = {};
  }

  async readHeader() {
    const fd = await open(this.filename, 'r');
    try {
      // 读取头部字节大小
      const buf = Buffer.allocUnsafe(4);
      await read(fd, buf);
      const headerBytesSize = buf.readInt32BE(0);

      // 读取头部字节
      const headerBytes = Buffer.allocUnsafe(headerBytesSize);
      await read(fd, headerBytes);

      // 读取校验和
      const checksum = Buffer.allocUnsafe(4);
      await read(fd, checksum);

      // 验证校验和
      if ((adler32.sum(headerBytes) & 0xffffffff) !== checksum.readInt32LE(0)) {
        throw new Error('header checksum failed');
      }

      // 解析 XML 头部
      const header = headerBytes.subarray(0, -2).toString('utf16le');
      console.log(header);
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
}
