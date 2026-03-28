/**
 * Generates placeholder PNG icons for the Impression Boost extension.
 * Colour: orange #f97316 (R=249, G=115, B=22).
 */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'extension-impression-boost', 'icons');

const R = 249, G = 115, B = 22;   // #f97316

// CRC32 table (standard PNG polynomial)
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU32BE(buf, offset, value) {
  buf[offset] = (value >> 24) & 0xff;
  buf[offset + 1] = (value >> 16) & 0xff;
  buf[offset + 2] = (value >> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  writeU32BE(len, 0, data.length);
  const combined = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  writeU32BE(crcBuf, 0, crc32(combined));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  writeU32BE(ihdrData, 0, size);   // width
  writeU32BE(ihdrData, 4, size);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type RGB
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw scanlines: filter byte 0, then size*3 RGB bytes per row
  const rowLength = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLength);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 3;
      raw[i] = R;
      raw[i + 1] = G;
      raw[i + 2] = B;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const filePath = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, createPng(size));
  console.log('Written:', filePath);
}
console.log('Done.');
