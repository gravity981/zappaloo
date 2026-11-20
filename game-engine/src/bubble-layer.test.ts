// @vitest-environment jsdom
// The cross of a pinned speech bubble (PRES-10): a circle whatever stylesheet the host page has.
import { describe, expect, it, vi } from "vitest";
import { BubbleLayer } from "./bubble-layer.ts";
import type { BubbleView } from "./bubble-layer.ts";

const view: BubbleView = {
  id: "g1",
  name: "Anna",
  pinned: true,
  compact: false,
  x: 10,
  y: 20,
  width: 120,
  height: 50,
  maxWidth: 200,
  tail: 20,
};

describe("the cross of a pinned bubble", () => {
  it("[PRES-10] is a 24 px circle that a host's own button rules (a minimum height, padding) cannot stretch", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const onClose = vi.fn();
    const layer = new BubbleLayer(parent, { onPin: vi.fn(), onClose, closeLabel: "Schliessen" });
    layer.update([view]);
    const cross = parent.querySelector<HTMLButtonElement>("button[aria-label=Schliessen]");
    expect(cross).not.toBeNull();
    // The preview page once gave every button `min-height: 2.4rem`, which made the cross an ellipse.
    expect(cross?.style.width).toBe("24px");
    expect(cross?.style.height).toBe("24px");
    expect(cross?.style.minWidth).toBe("0px");
    expect(cross?.style.minHeight).toBe("0px");
    expect(cross?.style.padding).toBe("0px");
    expect(cross?.style.borderRadius).toBe("50%");
    cross?.click();
    expect(onClose).toHaveBeenCalledWith("g1");
    layer.destroy();
    parent.remove();
  });
});
