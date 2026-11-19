// The profile photo (PRES-09): checked by its content, cropped to a square, shrunk and re-encoded, so that EXIF and
// GPS data never leave the server and every photo is small (sw-architecture.md 25, `sharp`). JPEG, PNG and WebP are
// accepted; a phone's browser turns a HEIC picture into JPEG when it is picked.
import sharp from "sharp";
import { PROFILE_LIMITS } from "@zappaloo/shared";
import { detectImage } from "../content/images.ts";

export class PhotoError extends Error {
  readonly code: "photo_too_large" | "photo_type" | "photo_invalid";

  constructor(code: PhotoError["code"], message: string) {
    super(message);
    this.name = "PhotoError";
    this.code = code;
  }
}

export interface ProcessedPhoto {
  bytes: Buffer;
  mime: "image/webp";
}

/** The most pixels of an upload that are decoded: a guard against a decompression bomb. */
const MAX_INPUT_PIXELS = 50_000_000;

/** The processed photo for an upload: a square WebP of `PROFILE_LIMITS.photoSide` pixels without metadata. */
export async function processPhoto(upload: Uint8Array): Promise<ProcessedPhoto> {
  if (upload.byteLength > PROFILE_LIMITS.photoBytes) {
    throw new PhotoError("photo_too_large", "the photo is larger than 10 MB");
  }
  if (detectImage(upload) === undefined) {
    throw new PhotoError("photo_type", "the file is not a JPEG, PNG or WebP image");
  }
  try {
    const bytes = await sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS })
      // Turns the picture upright by its EXIF orientation; the output carries no metadata.
      .rotate()
      .resize(PROFILE_LIMITS.photoSide, PROFILE_LIMITS.photoSide, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    return { bytes, mime: "image/webp" };
  } catch {
    throw new PhotoError("photo_invalid", "the photo cannot be read");
  }
}
