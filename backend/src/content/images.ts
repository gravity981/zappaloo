// Recognises the uploaded images by their content (CNT-06, 6.2): JPEG, PNG and WebP. The name and
// the sent type are not trusted, so a text file called `karte.jpg` is refused.
import type { IMAGE_TYPES } from "@zappaloo/shared";

export type ImageType = (typeof IMAGE_TYPES)[number];

export interface DetectedImage {
  mime: ImageType;
  extension: "jpg" | "png" | "webp";
}

const JPEG_START = [0xff, 0xd8, 0xff];
const PNG_START = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether `bytes` starts with `signature`. */
function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  );
}

/** The type of an image by its first bytes, or undefined for anything else. */
export function detectImage(bytes: Uint8Array): DetectedImage | undefined {
  if (startsWith(bytes, JPEG_START)) return { mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, PNG_START)) return { mime: "image/png", extension: "png" };
  // WebP: "RIFF" <size> "WEBP".
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return undefined;
}
