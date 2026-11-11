// Convert a .glb into a single self-contained .gltf (JSON with the binary buffer embedded as a data URI).
// Usage: node tools/glb2gltf.mjs in.glb out.gltf
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output] = process.argv;
const b = readFileSync(input);
if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
let off = 12, json = null, bin = null;
while (off < b.length) {
  const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), data = b.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
if (bin) json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
writeFileSync(output, JSON.stringify(json));
console.log(`${output}: ${(JSON.stringify(json).length / 1024).toFixed(0)} KB`);
