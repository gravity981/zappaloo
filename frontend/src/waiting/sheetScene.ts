// An event's own door scene (ACS-12): a sprite sheet whose frames play in a loop, and an
// optional glimpse picture shown when the guest taps the gap (sw-architecture.md 10.4).
import type { DoorSheet } from "@zappaloo/shared";
import type { Scene } from "./defaultScene.ts";

const GLIMPSE_MS = 3500;

/** Where a picture of this size lands on a canvas when it covers it, cropped at the edges. */
function cover(canvas: HTMLCanvasElement, width: number, height: number) {
  const scale = Math.max(canvas.width / width, canvas.height / height);
  return {
    scale,
    x: (canvas.width - width * scale) / 2,
    y: (canvas.height - height * scale) / 2,
  };
}

export function createSheetScene(
  canvas: HTMLCanvasElement,
  sheet: DoorSheet,
  images: { sheet: HTMLImageElement; glimpse?: HTMLImageElement | undefined },
  reducedMotion: boolean,
): Scene | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  let glimpseUntil = 0;
  return {
    tap(x, y, t) {
      if (!sheet.gap || !images.glimpse) return false;
      const rect = canvas.getBoundingClientRect();
      const px = ((x - rect.left) / rect.width) * canvas.width;
      const py = ((y - rect.top) / rect.height) * canvas.height;
      const place = cover(canvas, sheet.frameWidth, sheet.frameHeight);
      const fx = (px - place.x) / place.scale / sheet.frameWidth;
      const fy = (py - place.y) / place.scale / sheet.frameHeight;
      const inside =
        fx >= sheet.gap.x &&
        fx <= sheet.gap.x + sheet.gap.width &&
        fy >= sheet.gap.y &&
        fy <= sheet.gap.y + sheet.gap.height;
      if (inside) glimpseUntil = t + GLIMPSE_MS;
      return inside;
    },
    draw(t) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#2d2832";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (images.glimpse && t < glimpseUntil) {
        const place = cover(canvas, images.glimpse.naturalWidth, images.glimpse.naturalHeight);
        ctx.drawImage(
          images.glimpse,
          place.x,
          place.y,
          images.glimpse.naturalWidth * place.scale,
          images.glimpse.naturalHeight * place.scale,
        );
        return;
      }
      const frame = reducedMotion ? 0 : Math.floor((t / 1000) * sheet.fps) % sheet.frames;
      const place = cover(canvas, sheet.frameWidth, sheet.frameHeight);
      ctx.drawImage(
        images.sheet,
        frame * sheet.frameWidth,
        0,
        sheet.frameWidth,
        sheet.frameHeight,
        place.x,
        place.y,
        sheet.frameWidth * place.scale,
        sheet.frameHeight * place.scale,
      );
    },
  };
}
