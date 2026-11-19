// The texts of an NPC (MAP-21, GAME-37): the name it is shown with.
import { describe, expect, it } from "vitest";
import { npcKey, npcTitle } from "./npc-texts.ts";

describe("the name of an NPC", () => {
  it("[MAP-21] is the admin's name, else the Tiled label, else the name of the object", () => {
    expect(npcTitle({ name: "kuester", label: "Küster" }, { title: "Küster Fritz" })).toBe(
      "Küster Fritz",
    );
    expect(npcTitle({ name: "kuester", label: "Küster" }, {})).toBe("Küster");
    expect(npcTitle({ name: "kuester", label: "Küster" }, undefined)).toBe("Küster");
    expect(npcTitle({ name: "gaertner" }, undefined)).toBe("gaertner");
  });

  it("[MAP-21] its texts and its action are kept under the map and the name", () => {
    expect(npcKey("kirche", "kuester")).toBe("kirche/kuester");
  });
});
