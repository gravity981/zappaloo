// The labels of the objects in sight as HTML over the game canvas (GAME-41): white pills with black text, like the
// labels of the edge indicators. They are only names: a tap goes through them to what lies beneath.
import { estimateTextWidth } from "./indicators.ts";

/** The font of a label, as the stylesheet sets it below; the canvas measures a text in the same font. */
export const OBJECT_LABEL_FONT = "600 12px system-ui, sans-serif";

let measuring: CanvasRenderingContext2D | null | undefined;
const measured = new Map<string, number>();

/**
 * The width of a text in the label's font, measured by the browser (GAME-41, story 6.1f). An estimate of the length
 * was too narrow for some words, which then wrapped onto a second line. Without a canvas, the estimate is used.
 */
export function measureObjectLabelText(text: string): number {
  const known = measured.get(text);
  if (known !== undefined) return known;
  measuring ??=
    typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  let width = estimateTextWidth(text);
  if (measuring) {
    measuring.font = OBJECT_LABEL_FONT;
    width = measuring.measureText(text).width;
  }
  // The labels in sight are few and their texts repeat, so the cache stays small; it is emptied when it grows.
  if (measured.size > 500) measured.clear();
  measured.set(text, width);
  return width;
}

export interface ObjectLabelView {
  /** A key that stays the same for the same object. */
  id: string;
  text: string;
  /** The top left corner in the game view, in CSS pixels, and the most width the pill takes. */
  x: number;
  y: number;
  width: number;
}

export class ObjectLabelLayer {
  readonly #parent: HTMLElement;
  readonly #labels = new Map<string, HTMLSpanElement>();
  #hidden = false;

  constructor(parent: HTMLElement) {
    this.#parent = parent;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  }

  /** Hides all labels, as while a page is open above the game (GAME-11), or shows those of the last update again. */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    for (const label of this.#labels.values())
      label.style.display = hidden ? "none" : "-webkit-box";
  }

  /** Shows exactly these labels, creating, moving and removing them as needed. */
  update(views: readonly ObjectLabelView[]): void {
    const keep = new Set(views.map((view) => view.id));
    for (const [id, label] of this.#labels) {
      if (keep.has(id)) continue;
      label.remove();
      this.#labels.delete(id);
    }
    for (const view of views) {
      let label = this.#labels.get(view.id);
      if (label === undefined) {
        label = document.createElement("span");
        label.setAttribute("data-testid", "object-label");
        label.setAttribute("data-label", view.id);
        label.setAttribute("aria-hidden", "true");
        label.style.cssText =
          "position:absolute;left:0;top:0;z-index:3;box-sizing:border-box;overflow:hidden;width:max-content;" +
          "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:normal;" +
          "padding:2px 8px;border-radius:6px;background:#fff;" +
          "color:#000;font:600 12px/1.3 system-ui,sans-serif;pointer-events:none;" +
          "box-shadow:0 0 0 1px rgba(0,0,0,.3),1px 1px 0 1px rgba(0,0,0,.2)";
        this.#labels.set(view.id, label);
        this.#parent.append(label);
      }
      label.style.display = this.#hidden ? "none" : "-webkit-box";
      if (label.textContent !== view.text) label.textContent = view.text;
      label.style.maxWidth = `${String(view.width)}px`;
      label.style.transform = `translate(${String(Math.round(view.x))}px, ${String(Math.round(view.y))}px)`;
    }
  }

  destroy(): void {
    for (const label of this.#labels.values()) label.remove();
    this.#labels.clear();
  }
}
