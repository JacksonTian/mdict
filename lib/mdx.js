import { File } from './file.js';


export default class MDX extends File {
  constructor(filename) {
    super(filename, 'Dictionary');
  }

  // async index() {
  //   const fd = await open(this.filename, 'r');
  //   const position = this.recordBlockOffset;
  //   const indexDicts = [];
  //   const recordHeaderBytes = Buffer.allocUnsafe(32);
  //   await read(fd, recordHeaderBytes, { position: position});

  //   const numOfRecordBlocks = Number(recordHeaderBytes.readBigUint64BE(0));
  //   debug('number of record blocks: %s', numOfRecordBlocks);
  //   // number of entries
  //   const numOfEntries = Number(recordHeaderBytes.readBigUint64BE(8));
  //   debug('number of entries: %s', numOfEntries);
  //   if (numOfEntries !== this.numOfEntries) {
  //     throw new Error('mdx: number of entries mismatched');
  //   }

  //   const recordBlockInfoSize = Number(recordHeaderBytes.readBigUint64BE(16));
  //   debug('size of record block info: %s', recordBlockInfoSize);
  //   // number of bytes of key block info
  //   const recordBlockSize = Number(recordHeaderBytes.readBigUint64BE(24));
  //   debug('size of record block: %s', recordBlockSize);

  //   const recordBlockInfoBytes = Buffer.allocUnsafe(numOfRecordBlocks * 16);
  //   await read(fd, recordBlockInfoBytes, { position: position + 32});

  //   const recordBlockInfoList = [];
  //   for (let i = 0; i < numOfRecordBlocks; i++) {
  //     const compressedSize = Number(recordBlockInfoBytes.readBigUint64BE(i * 16));
  //     const decompressedSize = Number(recordBlockInfoBytes.readBigUint64BE(i * 16 + 8));
  //     recordBlockInfoList.push([compressedSize, decompressedSize]);
  //   }

  //   if (recordBlockInfoSize !== numOfRecordBlocks * 16) {
  //     throw new Error(`mdx: record block info size is mismatch`);
  //   }

  //   let newPostion = position + 32 + recordBlockInfoSize;
  //   let offset = 0;
  //   let i = 0;
  //   for (const [compressedSize, decompressedSize] of recordBlockInfoList) {
  //     const compressedBytes = Buffer.allocUnsafe(compressedSize);
  //     await read(fd, compressedBytes, { position: newPostion});

  //     // 4 bytes: compression type
  //     const recordBlockType = compressedBytes.subarray(0, 4);
  //     // 4 bytes: adler32 checksum of decompressed record block
  //     const checksum = compressedBytes.readInt32BE(4);

  //     while (i < this.keyList.length) {
  //       // 用来保存索引信息的空字典
  //       const dict = {};
  //       dict['file_pos'] = newPostion;
  //       dict['compressed_size'] = compressedSize;
  //       dict['decompressed_size'] = decompressedSize;
  //       dict['record_block_type'] = recordBlockType.readUInt32LE(0);
  //       const [start, keyText] = this.keyList[i];
  //       dict['record_start'] = start;
  //       dict['key_text'] = keyText.toString();
  //       dict['offset'] = offset;
  //       // reach the end of current record block
  //       if (start - offset >= decompressedSize) {
  //         break;
  //       } 
  //       let end;
  //       // record end index
  //       if (i < this.keyList.length - 1) {
  //         end = this.keyList[i + 1][0];
  //       } else {
  //         end = decompressedSize + offset;
  //       }
  //       dict['record_end'] = end;
  //       i += 1;
  //       // if check_block:
  //       //     data = record_block[record_start - offset:record_end - offset]
  //       indexDicts.push(dict);
  //     }
  //     offset += decompressedSize;
  //     newPostion += compressedSize;
  //   }

  //   await close(fd);

  //   this.indexDicts = indexDicts;
  //   return indexDicts;
  // }

  // async getByIndex(fd, index) {
  //   const position = index['file_pos'];
  //   const recordBlockCompressed = Buffer.allocUnsafe(index['compressed_size']);
  //   await read(fd, recordBlockCompressed, {
  //     position
  //   });

  //   const recordBlockType = recordBlockCompressed.subarray(0, 4);
  //   // record_block_type = index['record_block_type']
  //   const decompressedSize = index['decompressed_size'];
  //   const recordBlock = zlib.unzipSync(recordBlockCompressed.subarray(8));
  //   const record = recordBlock.subarray(index['record_start'] - index['offset'], index['record_end'] - index['offset']);

  //   // #adler32 = unpack('>I', record_block_compressed[4:8])[0]
  //   // if record_block_type == 0:
  //   //     _record_block = record_block_compressed[8:]
  //   //     # lzo compression
  //   // elif record_block_type == 1:
  //   //     if lzo is None:
  //   //         print("LZO compression is not supported")
  //   //         # decompress
  //   //     header = b'\xf0' + pack('>I', index['decompressed_size'])
  //   //     _record_block = lzo.decompress(record_block_compressed[8:], initSize = decompressed_size, blockSize=1308672)
  //   //         # zlib compression
  //   // elif record_block_type == 2:
  //   //     # decompress
  //   //    _record_block = zlib.decompress(record_block_compressed[8:])
  //   // record = _record_block[index['record_start'] - index['offset']:index['record_end'] - index['offset']]
  //   // record = record = record.decode(self._encoding, errors='ignore').strip(u'\x00').encode('utf-8')
  //   // if self._stylesheet:
  //   //     record = self._replace_stylesheet(record)
  //   // record = record.decode('utf-8')
  //   return record.toString('utf-8');
  // }

}
