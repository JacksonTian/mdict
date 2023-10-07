# MDX builder for Node.js

```plaintext
mdx = header + key list + ...;
header = header size(4,BE) + header bytes(see: header size) + header checksum(4, LE)
key list = key list meta(44) + key block info compressed
key list meta = block + block checksum(4, BE)
block = num_key_blocks(8,BE) + num_entries(8,BE) + key_block_info_decomp_size(8,BE) + key_block_info_size(8,BE) + key_block_size(8,BE)
key block info compressed = compression type(4) + key block info checksum(4,BE) + key block info compressed bytes
key block info = (key block)*
key block = num_entries(8,BE) + text header size(2,BE) + text tail size(2,BE) + compressed size(8,BE) + decompressed size(8,BE)
```


Inspired by https://github.com/righthandabacus/mdict_reader .