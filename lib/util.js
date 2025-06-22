import { Buffer } from 'buffer';
/**
 * 快速解密方法
 * @param {Buffer} data 要解密的数据
 * @param {Buffer} key 解密密钥
 * @returns {Buffer} 解密后的数据
 */
export function fastDecrypt(data, key) {
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

/**
 * 在缓冲区中查找分隔符
 * @param {Buffer} buff 要搜索的缓冲区
 * @param {number} start 开始搜索的位置
 * @param {Buffer} delimiter 分隔符
 * @returns {number|undefined} 分隔符的位置，如果未找到则返回 undefined
 */
export function findDelimiter(buff, start, delimiter) {
  let offset = start;
  while (offset < buff.byteLength) {
    if (buff.subarray(offset, offset + delimiter.byteLength).compare(delimiter) === 0) {
      return offset;
    }
    offset += delimiter.byteLength;
  }
}

