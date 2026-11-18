// The app icons of the theme package (sw-architecture.md 19.7 and 19.7.1, THM-10): four PNGs made in
// the browser from one square image, or replaced by a PNG of their own. The names and sizes come
// from the package definition, so the editor cannot drift from the validator.
import { themeV1 } from "@zappaloo/shared";

export interface IconSpec {
  /** The path in the package, `icons/icon-192.png`. */
  path: string;
  /** The name the editor shows, `icon-192`. */
  name: string;
  size: number;
  required: boolean;
  maskable: boolean;
}

export const ICONS: readonly IconSpec[] = themeV1.layout.flatMap((entry) =>
  entry.kind === "png" && entry.size !== undefined
    ? [
        {
          path: entry.path,
          name: entry.path.replace(/^icons\//, "").replace(/\.png$/, ""),
          size: entry.size.width,
          required: entry.required,
          maskable: entry.path.includes("maskable"),
        },
      ]
    : [],
);

/** The smallest side of the image the icons are made from (19.7.1). */
export const MIN_SOURCE_SIZE = 512;

/** The part of a maskable icon that holds the content: the central 80 % (19.7). */
export const SAFE_ZONE = 0.8;

export interface PngSize {
  width: number;
  height: number;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The width and height of a PNG file, read from its IHDR chunk, or undefined when it is no PNG. */
export function pngSize(bytes: Uint8Array): PngSize | undefined {
  if (bytes.length < 24) return undefined;
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) return undefined;
  const tag = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (tag !== "IHDR") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A problem with a PNG of the icon's own, in the words of the validator's finding, or undefined. */
export function ownIconProblem(spec: IconSpec, bytes: Uint8Array): string | undefined {
  const size = pngSize(bytes);
  if (size === undefined) return `${spec.name}: not a PNG image`;
  if (size.width !== spec.size || size.height !== spec.size) {
    const wanted = `${String(spec.size)} × ${String(spec.size)}`;
    return `${spec.name}: wrong size (${String(size.width)} × ${String(size.height)} instead of ${wanted})`;
  }
  return undefined;
}

/** A problem with the image the icons are made from, or undefined (19.7.1: square, at least 512 px). */
export function sourceProblem(width: number, height: number): string | undefined {
  if (width !== height) {
    return `the image must be square (it is ${String(width)} × ${String(height)})`;
  }
  if (width < MIN_SOURCE_SIZE) {
    return `the image must be at least ${String(MIN_SOURCE_SIZE)} px (it is ${String(width)} × ${String(height)})`;
  }
  return undefined;
}

/** Where the image goes on an icon: the whole icon, or the central 80 % on a background colour. */
export function iconDrawing(size: number, maskable: boolean) {
  const content = maskable ? Math.round(size * SAFE_ZONE) : size;
  const offset = Math.round((size - content) / 2);
  return { fillBackground: maskable, x: offset, y: offset, width: content, height: content };
}

/** What `renderIcon` needs of a canvas, so that a test can stand in for the browser's. */
export interface IconCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasRenderingContext2D | null;
  toBlob(callback: (blob: Blob | null) => void, type: string): void;
}

export type CanvasFactory = () => IconCanvas;
const browserCanvas: CanvasFactory = () => document.createElement("canvas");

/** One icon as PNG bytes: the image scaled to `size`; the maskable one on a background colour. */
export async function renderIcon(
  image: CanvasImageSource,
  spec: IconSpec,
  background: string,
  createCanvas: CanvasFactory = browserCanvas,
): Promise<Uint8Array> {
  const canvas = createCanvas();
  canvas.width = spec.size;
  canvas.height = spec.size;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("the browser cannot draw icons");
  const drawing = iconDrawing(spec.size, spec.maskable);
  if (drawing.fillBackground) {
    context.fillStyle = background;
    context.fillRect(0, 0, spec.size, spec.size);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, drawing.x, drawing.y, drawing.width, drawing.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (blob === null) throw new Error("the browser cannot encode the icon as PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decodes the uploaded image (PNG or JPEG). */
export async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes.slice().buffer], { type: mime }));
}

/** A `data:` URL of PNG bytes, for the thumbnails. */
export function pngDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}
