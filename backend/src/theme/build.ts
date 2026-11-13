// Builds theme packages: a PNG encoder for the icons, and the tar.gz archive. The tests and the example
// package of the repository (step 4e-7) use the same code, so a package in a test is a real package.
import { deflateSync, gzipSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG image of one colour, `width` × `height` pixels. */
export function encodePng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) {
    row.set([r, g, b, 255], 1 + x * 4);
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A tar header (ustar) for a file or a folder. */
function header(name: string, size: number, type: "0" | "5"): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write(type === "5" ? "0000755\0" : "0000644\0", 100, 8, "latin1");
  block.write("0000000\0", 108, 8, "latin1");
  block.write("0000000\0", 116, 8, "latin1");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "latin1");
  block.write("00000000000\0", 136, 12, "latin1");
  block.write("        ", 148, 8, "latin1");
  block.write(type, 156, 1, "latin1");
  block.write("ustar\0", 257, 6, "latin1");
  block.write("00", 263, 2, "latin1");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return block;
}

/** A gzip-compressed tar archive of the given files; folders are added for their paths. */
export function buildThemeArchive(files: Record<string, Buffer>): Buffer {
  const parts: Buffer[] = [];
  const folders = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts2 = path.split("/");
    for (let i = 1; i < parts2.length; i++) folders.add(parts2.slice(0, i).join("/"));
  }
  for (const folder of [...folders].sort()) {
    parts.push(header(`${folder}/`, 0, "5"));
  }
  for (const [path, data] of Object.entries(files)) {
    parts.push(header(path, data.length, "0"));
    parts.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}
