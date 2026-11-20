// The name of an NPC (MAP-21, GAME-37, GAME-40, CNT-09): what it is shown with.
import { describe, expect, it } from "vitest";
import { npcKey, npcTitle } from "./npc-texts.ts";

describe("the name of an NPC", () => {
  it("[GAME-40][CNT-09] is the figure name of its dialogue, else the title of the page its action opens, else the Tiled label, else the name of the object", () => {
    const sexton = { name: "kuester", label: "Küster" };
    expect(npcTitle(sexton, { title: "Küster Fritz" }, "Programm")).toBe("Küster Fritz");
    expect(npcTitle(sexton, {}, "Programm")).toBe("Programm");
    expect(npcTitle(sexton, undefined, "Programm")).toBe("Programm");
    expect(npcTitle(sexton, undefined)).toBe("Küster");
    expect(npcTitle({ name: "gaertner" }, undefined)).toBe("gaertner");
  });

  it("[MAP-21] its texts and its action are kept under the map and the name", () => {
    expect(npcKey("kirche", "kuester")).toBe("kirche/kuester");
  });
});
