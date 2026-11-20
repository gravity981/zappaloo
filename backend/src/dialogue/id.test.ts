import { describe, expect, it } from "vitest";
import { dialogueSlug, newDialogueId } from "./id.ts";

describe("the id of a dialogue (CNT-09)", () => {
  it("[CNT-09] is made from the figure's name: lower case, umlauts spelled out, one dash between words", () => {
    expect(dialogueSlug("Pfarrer Keller")).toBe("pfarrer-keller");
    expect(dialogueSlug("  Küster Fritz!  ")).toBe("kuester-fritz");
    expect(dialogueSlug("Fräulein Müller-Öl, Straße")).toBe("fraeulein-mueller-oel-strasse");
    expect(dialogueSlug("José Ñandú")).toBe("jose-nandu");
  });

  it("[CNT-09] is at most 40 characters and never ends with a dash", () => {
    const slug = dialogueSlug("Ein sehr langer Name für einen Pfarrer, der kein Ende nimmt");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("[CNT-09] gets -2, -3, … when the id is taken, and a name without letters becomes dialog", () => {
    const taken = new Set(["pfarrer-keller", "pfarrer-keller-2"]);
    expect(newDialogueId("Pfarrer Keller", (id) => taken.has(id))).toBe("pfarrer-keller-3");
    expect(newDialogueId("Wirt", (id) => taken.has(id))).toBe("wirt");
    expect(newDialogueId("!!!", () => false)).toBe("dialog");
    const long = "a".repeat(60);
    const first = newDialogueId(long, () => false);
    expect(newDialogueId(long, (id) => id === first)).toHaveLength(40);
  });
});
