// Writes the built-in default app icons (19.5, PWA-02) to backend/src/pwa/default-icons/:
// a pixel-art "Z" in the neutral colours of the platform. Run once with
// `node scripts/generate-app-icons.ts`; the PNGs are committed. No dependencies: the PNG
// is encoded here (8-bit RGB, one IDAT chunk).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "backend",
  "src",
  "pwa",
  "default-icons",
);

const BACKGROUND = [0x2a, 0x2a, 0x28] as const;
const INK = [0xf4, 0xf4, 0xf1] as const;
const ACCENT = [0xc4, 0x42, 0x2e] as const;

// A 7×7 "Z": top bar, diagonal, bottom bar. The diagonal's middle pixel is the accent.
const GLYPH = ["ZZZZZZZ", ".....Z.", "....Z..", "...A...", "..Z....", ".Z.....", "ZZZZZZZ"];

function pixel(x: number, y: number, size: number, share: number): readonly number[] {
  const cell = (size * share) / GLYPH.length;
  const origin = (size - cell * GLYPH.length) / 2;
  const gx = Math.floor((x - origin) / cell);
  const gy = Math.floor((y - origin) / cell);
  const mark = GLYPH[gy]?.[gx];
  if (x < origin || y < origin || mark === undefined) return BACKGROUND;
  return mark === "Z" ? INK : mark === "A" ? ACCENT : BACKGROUND;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function png(size: number, share: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0
    for (let x = 0; x < size; x += 1) {
      Buffer.from(pixel(x, y, size, share)).copy(row, 1 + x * 3);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB, deflate, no filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// "any" icons use 60 % of the width for the glyph; the maskable icon keeps all content
// inside the central 80 % (the safe zone), so 50 %.
const ICONS: [string, number, number][] = [
  ["icon-192.png", 192, 0.6],
  ["icon-512.png", 512, 0.6],
  ["icon-maskable-512.png", 512, 0.5],
  ["apple-touch-icon.png", 180, 0.6],
];

mkdirSync(OUT, { recursive: true });
for (const [name, size, share] of ICONS) {
  writeFileSync(join(OUT, name), png(size, share));
}
console.log(`wrote ${String(ICONS.length)} icons to ${OUT}`);
