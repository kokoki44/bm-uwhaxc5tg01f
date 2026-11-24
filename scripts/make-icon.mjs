// Erzeugt ein schlichtes Platzhalter-Symbol (einfarbige Fläche) als Quelle für "tauri icon".
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
const n = 1024, [r, g, b] = [0x1f, 0x6f, 0xb2];
const raw = Buffer.alloc(n * (n * 4 + 1));
for (let y = 0; y < n; y++) { const o = y * (n * 4 + 1); raw[o] = 0; for (let x = 0; x < n; x++) raw.set([r, g, b, 255], o + 1 + x * 4); }
const crcT = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(process.argv[2], Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
