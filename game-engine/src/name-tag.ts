// The name tag of a guest figure (PRES-01): the white pill of the edge-indicator labels (edge-indicators.ts), drawn
// into a canvas so that its text, padding, rounded corners and outline are the same. Sizes are in CSS pixels; the
// canvas has `ratio` device pixels per CSS pixel, so the tag is as sharp as the label.

const FONT = '600 12px system-ui, "Segoe UI", sans-serif';
const LINE_HEIGHT = 12 * 1.3;
const PADDING = { x: 8, y: 2 };
const RADIUS = 6;
/** The ring's outline and shadow reach this far beyond the pill (box-shadow spread, 1px offset). */
const BLEED = 2;

export interface NameTagImage {
  canvas: HTMLCanvasElement;
  /** Device pixels of the canvas per CSS pixel. */
  ratio: number;
  /** The pill's size in CSS pixels, without the ring. */
  width: number;
  height: number;
}

function pill(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/** Draws the tag for `text` (already shortened). Undefined where a canvas cannot be made. */
export function drawNameTag(text: string, ratio: number): NameTagImage | undefined {
  const measure = document.createElement("canvas").getContext("2d");
  if (measure === null) return undefined;
  measure.font = FONT;
  const width = Math.ceil(measure.measureText(text).width) + PADDING.x * 2;
  const height = Math.ceil(LINE_HEIGHT) + PADDING.y * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((width + BLEED * 2) * ratio);
  canvas.height = Math.ceil((height + BLEED * 2) * ratio);
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  context.scale(ratio, ratio);
  context.translate(BLEED, BLEED);
  // box-shadow: 0 0 0 1px rgba(0,0,0,.3), 1px 1px 0 1px rgba(0,0,0,.2)
  context.fillStyle = "rgba(0,0,0,0.2)";
  pill(context, 0, 0, width + 2, height + 2, RADIUS + 1);
  context.fill();
  context.fillStyle = "rgba(0,0,0,0.3)";
  pill(context, -1, -1, width + 2, height + 2, RADIUS + 1);
  context.fill();
  context.fillStyle = "#fff";
  pill(context, 0, 0, width, height, RADIUS);
  context.fill();
  context.fillStyle = "#000";
  context.font = FONT;
  context.textBaseline = "middle";
  context.fillText(text, PADDING.x, height / 2 + 0.5);
  return { canvas, ratio, width: width + BLEED * 2, height: height + BLEED * 2 };
}
