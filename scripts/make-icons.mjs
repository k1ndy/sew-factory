// Генератор PNG-иконок для PWA (без внешних зависимостей).
// Рисует катушку ниток на синем фоне и сохраняет icon-192/512/180.png.
// Запуск: node scripts/make-icons.mjs
import zlib from 'zlib';
import fs from 'fs';

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function render(N) {
  const buf = Buffer.alloc(N * N * 4);
  const bg = hex('#1f6feb'), white = [255, 255, 255], flange = hex('#cdd9f7'), thread = hex('#1a5fcc'), needle = hex('#ffd23f');
  const set = (x, y, c) => { const i = (y * N + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c = bg;                                   // фон (вся плитка — для maskable)
    const sx0 = 0.37 * N, sx1 = 0.63 * N, sy0 = 0.26 * N, sy1 = 0.74 * N;
    if (x >= sx0 && x < sx1 && y >= sy0 && y < sy1) c = white;           // тело катушки
    const fx0 = 0.30 * N, fx1 = 0.70 * N;
    if (x >= fx0 && x < fx1 && ((y >= 0.24 * N && y < 0.30 * N) || (y >= 0.70 * N && y < 0.76 * N))) c = flange; // фланцы
    if (x >= sx0 && x < sx1) {                                           // нитки на теле
      for (const ty of [0.34, 0.42, 0.50, 0.58, 0.66]) if (Math.abs(y - ty * N) < Math.max(1, 0.012 * N)) c = thread;
    }
    // игла справа (диагональная линия)
    if (Math.abs((x - 0.70 * N) - (y - 0.30 * N) * 0.0) < Math.max(1, 0.012 * N) && y >= 0.22 * N && y < 0.78 * N) c = needle;
    set(x, y, c);
  }
  return buf;
}

for (const N of [192, 512, 180]) {
  const out = png(N, N, render(N));
  const name = N === 180 ? 'icon-180.png' : `icon-${N}.png`;
  fs.writeFileSync(`icons/${name}`, out);
  console.log('wrote', name, out.length, 'bytes');
}
