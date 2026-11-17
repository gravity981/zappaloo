// The edge indicators as buttons over the game canvas (GAME-26). The layout and the rules are in indicators.ts; this
// only puts the buttons in place. They are HTML rather than part of the canvas, because their touch area is a size in
// CSS pixels (at least 44 × 44) whatever the pixel ratio of the canvas, and a button can be named for screen readers.
import { INDICATOR_TOUCH_SIZE } from "./indicators.ts";
import { GLOW_COLOR } from "./walk-feedback.ts";

export interface IndicatorView {
  /** A key that stays the same for the same object. */
  id: string;
  kind: "object" | "portal";
  label: string;
  /** The centre of the indicator in the game view, in CSS pixels. */
  x: number;
  y: number;
  /** The direction to the object in radians, 0 being to the right and positive turning down. */
  angle: number;
}

const SVG = "http://www.w3.org/2000/svg";
const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

function svg(name: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

/** The picture of an indicator: a dark round button with a white outline, its symbol and a pointer towards the object. */
function picture(view: IndicatorView): SVGElement {
  const root = svg("svg", {
    width: "44",
    height: "44",
    viewBox: "-22 -22 44 44",
    "aria-hidden": "true",
  });
  root.style.display = "block";
  root.style.overflow = "visible";
  root.append(
    svg("circle", { r: "18", fill: "rgba(34,34,34,0.88)", stroke: "#fff", "stroke-width": "2" }),
  );
  const turning = svg("g", { transform: `rotate(${String((view.angle * 180) / Math.PI)})` });
  // The pointer: a small white triangle outside the circle, towards the object.
  turning.append(svg("path", { d: "M27 0 L19 -6 L19 6 Z", fill: "#fff" }));
  if (view.kind === "portal") {
    // An arrow like the floating arrow of the portal, in its warm colour, pointing the same way.
    turning.append(
      svg("path", {
        d: "M10 0 L-1 -9 L-1 -4 L-9 -4 L-9 4 L-1 4 L-1 9 Z",
        fill: "#ffd23f",
        stroke: "#5a4200",
        "stroke-width": "1.5",
        "stroke-linejoin": "round",
      }),
    );
    root.append(turning);
  } else {
    root.append(turning);
    // A sparkle in the colour of the sparkles on the objects (GAME-15), upright whatever the direction.
    root.append(
      svg("path", {
        d: "M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z",
        fill: hex(GLOW_COLOR),
      }),
    );
  }
  return root;
}

/** The buttons of the edge indicators over a game canvas. */
export class EdgeIndicatorLayer {
  readonly #parent: HTMLElement;
  readonly #onTap: (id: string) => void;
  readonly #buttons = new Map<string, { button: HTMLButtonElement; key: string }>();
  #hidden = false;

  constructor(parent: HTMLElement, onTap: (id: string) => void) {
    this.#parent = parent;
    this.#onTap = onTap;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  }

  /** Hides all indicators, as while a page is open above the game (GAME-11), or shows those of the last update again. */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    for (const { button } of this.#buttons.values()) button.hidden = hidden;
  }

  /** Shows exactly these indicators, creating, moving and removing buttons as needed. */
  update(views: readonly IndicatorView[]): void {
    const keep = new Set(views.map((view) => view.id));
    for (const [id, entry] of this.#buttons) {
      if (keep.has(id)) continue;
      entry.button.remove();
      this.#buttons.delete(id);
    }
    for (const view of views) {
      let entry = this.#buttons.get(view.id);
      if (entry === undefined) {
        entry = { button: this.#create(view), key: "" };
        this.#buttons.set(view.id, entry);
        this.#parent.append(entry.button);
      }
      entry.button.hidden = this.#hidden;
      // The picture turns with the direction; the position changes every frame, the picture only when it must.
      const key = String(Math.round(view.angle * 50));
      if (key !== entry.key) {
        entry.key = key;
        entry.button.replaceChildren(picture(view));
      }
      const half = INDICATOR_TOUCH_SIZE / 2;
      entry.button.style.transform = `translate(${String(Math.round(view.x - half))}px, ${String(Math.round(view.y - half))}px)`;
    }
  }

  destroy(): void {
    for (const { button } of this.#buttons.values()) button.remove();
    this.#buttons.clear();
  }

  #create(view: IndicatorView): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-testid", "edge-indicator");
    button.setAttribute("data-indicator", view.id);
    button.setAttribute("data-kind", view.kind);
    button.setAttribute("aria-label", view.label);
    button.style.cssText =
      `position:absolute;left:0;top:0;z-index:4;width:${String(INDICATOR_TOUCH_SIZE)}px;` +
      `height:${String(INDICATOR_TOUCH_SIZE)}px;margin:0;padding:0;border:0;background:transparent;` +
      "cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
    button.addEventListener("click", () => {
      this.#onTap(view.id);
    });
    return button;
  }
}
