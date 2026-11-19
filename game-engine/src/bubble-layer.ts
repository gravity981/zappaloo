// The speech bubbles of the guest figures as HTML over the game canvas (PRES-10, UX mock `game`): crisp text, a real
// button for the cross and an area to click or tap. Where they stand and which are shown is decided in bubble.ts;
// this only puts them in place, like the edge indicators (edge-indicators.ts).

export interface BubbleView {
  /** A key that stays the same for the same guest. */
  id: string;
  name: string;
  badge?: string | undefined;
  greeting?: string | undefined;
  line?: string | undefined;
  /** The address of the photo; without one the initials are shown. */
  photo?: string | undefined;
  /** A pinned bubble stays open until its cross is used. */
  pinned: boolean;
  /** The top left corner in the game view, in CSS pixels, and its width. */
  x: number;
  y: number;
  width: number;
  /** Where the tail points to, from the left edge of the bubble. */
  tail: number;
}

export interface BubbleCallbacks {
  /** A click or tap on a bubble pins it. */
  onPin: (id: string) => void;
  /** The cross of a pinned bubble. */
  onClose: (id: string) => void;
  /** The name of the cross for screen readers; the host's word. */
  closeLabel: string;
}

/** The first letters of a name, for the round picture without a photo. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part !== "")
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("");
  return letters === "" ? "?" : letters.toLocaleUpperCase();
}

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(name);
  result.style.cssText = css;
  if (text !== undefined) result.textContent = text;
  return result;
}

const PIC = "flex:none;width:40px;height:40px;border-radius:50%;";

export class BubbleLayer {
  readonly #parent: HTMLElement;
  readonly #callbacks: BubbleCallbacks;
  readonly #bubbles = new Map<
    string,
    { root: HTMLDivElement; tail: HTMLSpanElement; key: string }
  >();
  #hidden = false;

  constructor(parent: HTMLElement, callbacks: BubbleCallbacks) {
    this.#parent = parent;
    this.#callbacks = callbacks;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  }

  /** Hides all bubbles, as while a page is open above the game (GAME-11), or shows those of the last update again. */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    for (const { root } of this.#bubbles.values()) this.#show(root);
  }

  /** Shows or hides a bubble: the `hidden` attribute alone loses to the bubble's own `display: flex`. */
  #show(root: HTMLDivElement): void {
    root.hidden = this.#hidden;
    root.style.display = this.#hidden ? "none" : "flex";
  }

  /** Shows exactly these bubbles, creating, moving and removing them as needed. */
  update(views: readonly BubbleView[]): void {
    const keep = new Set(views.map((view) => view.id));
    for (const [id, entry] of this.#bubbles) {
      if (keep.has(id)) continue;
      entry.root.remove();
      this.#bubbles.delete(id);
    }
    for (const view of views) {
      const key = [
        view.name,
        view.badge,
        view.greeting,
        view.line,
        view.photo,
        view.pinned,
        view.width,
      ].join("|");
      let entry = this.#bubbles.get(view.id);
      if (entry?.key !== key) {
        entry?.root.remove();
        entry = { ...this.#create(view), key };
        this.#bubbles.set(view.id, entry);
        this.#parent.append(entry.root);
      }
      this.#show(entry.root);
      entry.root.style.transform = `translate(${String(Math.round(view.x))}px, ${String(Math.round(view.y))}px)`;
      entry.tail.style.left = `${String(Math.round(view.tail) - 7)}px`;
    }
  }

  destroy(): void {
    for (const { root } of this.#bubbles.values()) root.remove();
    this.#bubbles.clear();
  }

  #create(view: BubbleView): { root: HTMLDivElement; tail: HTMLSpanElement } {
    const root = element(
      "div",
      `position:absolute;left:0;top:0;z-index:5;box-sizing:border-box;width:${String(view.width)}px;display:flex;gap:10px;` +
        "padding:10px;background:#fff;color:#000;border:2px solid #222;border-radius:12px;" +
        "box-shadow:3px 3px 0 rgba(0,0,0,.25);font:12px/1.3 system-ui,sans-serif;cursor:pointer;" +
        "touch-action:manipulation;-webkit-tap-highlight-color:transparent",
    );
    root.setAttribute("data-testid", "guest-bubble");
    root.setAttribute("data-guest", view.id);
    root.setAttribute("data-pinned", String(view.pinned));
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", view.name);
    root.tabIndex = 0;
    root.addEventListener("click", () => {
      if (!view.pinned) this.#callbacks.onPin(view.id);
    });
    root.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !view.pinned) {
        event.preventDefault();
        this.#callbacks.onPin(view.id);
      }
    });
    if (view.photo === undefined) {
      root.append(
        element(
          "div",
          `${PIC}display:grid;place-items:center;background:#e8e8e2;border:1.5px solid #d5d5ce;` +
            "color:#6a6a64;font-weight:600;font-size:13px",
          initialsOf(view.name),
        ),
      );
    } else {
      const picture = element("img", `${PIC}object-fit:cover;border:1.5px solid #d5d5ce`);
      picture.src = view.photo;
      picture.alt = "";
      root.append(picture);
    }
    const text = element(
      "div",
      "flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;overflow-wrap:anywhere",
    );
    text.append(element("b", "font-size:13px;font-weight:700", view.name));
    if (view.badge !== undefined) {
      text.append(
        element(
          "span",
          "padding:1px 8px;border-radius:999px;background:#e8e8e2;font-size:11px;font-weight:600",
          view.badge,
        ),
      );
    }
    if (view.greeting !== undefined) text.append(element("span", "", view.greeting));
    if (view.line !== undefined) text.append(element("span", "color:#6a6a64", view.line));
    root.append(text);
    // The tail points down at the figure; it moves with the bubble when this is held inside the view.
    const tail = element(
      "span",
      "position:absolute;bottom:-9px;left:0;width:14px;height:14px;background:#fff;" +
        "border-right:2px solid #222;border-bottom:2px solid #222;transform:rotate(45deg)",
    );
    root.append(tail);
    if (view.pinned) {
      const close = element(
        "button",
        "position:absolute;top:-10px;right:-10px;width:24px;height:24px;padding:0;border:0;border-radius:50%;" +
          "background:#222;color:#fff;font:13px/1 system-ui,sans-serif;cursor:pointer;display:grid;place-items:center",
        "×",
      );
      close.type = "button";
      close.setAttribute("aria-label", this.#callbacks.closeLabel);
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        this.#callbacks.onClose(view.id);
      });
      root.append(close);
    }
    return { root, tail };
  }
}
