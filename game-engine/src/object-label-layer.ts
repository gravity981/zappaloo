// The labels of the objects in sight as HTML over the game canvas (GAME-41): white pills with black text, like the
// labels of the edge indicators. They are only names: a tap goes through them to what lies beneath.

export interface ObjectLabelView {
  /** A key that stays the same for the same object. */
  id: string;
  text: string;
  /** The top left corner in the game view, in CSS pixels, and the width of the pill. */
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
    for (const label of this.#labels.values()) label.style.display = hidden ? "none" : "block";
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
          "position:absolute;left:0;top:0;z-index:3;box-sizing:border-box;overflow:hidden;" +
          "text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border-radius:6px;background:#fff;" +
          "color:#000;font:600 12px/1.3 system-ui,sans-serif;pointer-events:none;" +
          "box-shadow:0 0 0 1px rgba(0,0,0,.3),1px 1px 0 1px rgba(0,0,0,.2)";
        this.#labels.set(view.id, label);
        this.#parent.append(label);
      }
      label.style.display = this.#hidden ? "none" : "block";
      if (label.textContent !== view.text) label.textContent = view.text;
      label.style.width = `${String(view.width)}px`;
      label.style.transform = `translate(${String(Math.round(view.x))}px, ${String(Math.round(view.y))}px)`;
    }
  }

  destroy(): void {
    for (const label of this.#labels.values()) label.remove();
    this.#labels.clear();
  }
}
