// The size of a PNG image, read from its IHDR chunk (sw-architecture.md 19.7: the icons are PNGs of
// exactly their size; 14.4: the sprite sheets and tilesets have a size the validator checks).

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngSize {
  width: number;
  height: number;
}

/** The width and height of a PNG file, or undefined when the bytes are not a PNG. */
export function pngSize(bytes: Buffer): PngSize | undefined {
  if (bytes.length < 24) return undefined;
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) return undefined;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
