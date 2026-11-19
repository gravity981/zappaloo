import { describe, expect, it } from "vitest";
import type { GuestFigure } from "@zappaloo/shared";
import { guestsOnMap, sampleGuests, tagText, TAG_MAX_CHARACTERS, wanderMapIds } from "./wander.ts";
import type { ParsedMap } from "./map-model.ts";
import type { LoadedWorld } from "./world-data.ts";

const map = (id: string, wanders: number) =>
  ({ id, wanders: Array.from({ length: wanders }, () => []) }) as unknown as ParsedMap;
const figure = (id: string) => ({ id }) as unknown as LoadedWorld["figures"][number];
const world = (maps: ParsedMap[], figures = ["a", "b"]) =>
  ({
    maps: new Map(maps.map((item) => [item.id, item])),
    figures: figures.map(figure),
  }) as unknown as LoadedWorld;

describe("the guests of a map (PRES-01, PRES-02, PRES-08)", () => {
  const maps = [map("garten", 1), map("saal", 2), map("kirche", 0)];
  const crowd = world(maps);
  const bare = { greeting: null, badge: null, line: null, photo: null };
  const guests: GuestFigure[] = Array.from({ length: 40 }, (_, i) => ({
    id: `u${String(i)}`,
    name: `G${String(i)}`,
    figure: "a",
    ...bare,
  }));

  it("[PRES-02] only maps with wander areas take guests, and every guest is on exactly one map", () => {
    expect(wanderMapIds(crowd).sort()).toEqual(["garten", "saal"]);
    const garten = guestsOnMap(crowd, { id: "garten" }, guests);
    const saal = guestsOnMap(crowd, { id: "saal" }, guests);
    const kirche = guestsOnMap(crowd, { id: "kirche" }, guests);
    expect(kirche).toEqual([]);
    expect(garten.length + saal.length).toBe(guests.length);
    expect(garten.length).toBeGreaterThan(0);
    expect(saal.length).toBeGreaterThan(0);
  });

  it("[PRES-01] a guest whose figure the world does not have does not appear", () => {
    const only = guestsOnMap(world([map("garten", 1)]), map("garten", 1), [
      { id: "u1", name: "x", figure: "gone", ...bare },
      { id: "u2", name: "y", figure: "a", ...bare },
    ]);
    expect(only.map((guest) => guest.id)).toEqual(["u2"]);
  });

  it("[PRES-01] a long name is cut with an ellipsis for the name tag", () => {
    expect(tagText("  Anna  ")).toBe("Anna");
    const cut = tagText("x".repeat(60));
    expect(Array.from(cut)).toHaveLength(TAG_MAX_CHARACTERS);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("the sample guests of the game preview", () => {
  it("gives every map with a wander area at least two figures of the world, and none without wander areas", () => {
    const maps = [map("garten", 1), map("saal", 1), map("kirche", 0)];
    const crowd = world(maps);
    const samples = sampleGuests(crowd);
    for (const item of maps.slice(0, 2)) {
      expect(guestsOnMap(crowd, item, samples).length).toBeGreaterThanOrEqual(2);
    }
    expect(guestsOnMap(crowd, { id: "kirche" }, samples)).toEqual([]);
    expect(sampleGuests(world([map("kirche", 0)]))).toEqual([]);
  });
});
