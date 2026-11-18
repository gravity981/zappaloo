import { describe, expect, it } from "vitest";
import {
  WAIT_MAX_MS,
  WAIT_MIN_MS,
  Wanderer,
  guestMapOf,
  hashOf,
  reachableWanderCells,
  waitDuration,
  wanderCells,
  type WanderEnvironment,
} from "./wander.ts";
import { navigationGrid } from "./navigation.ts";
import { cellCentre } from "./collision.ts";
import type { Cell } from "./pathfinding.ts";

const size = { width: 64, height: 32 };

/** A map of 6 × 6 cells without obstacles and a wander area around the centres of some cells. */
function openMap(wanders: { x: number; y: number }[][] = []) {
  return {
    size,
    columns: 6,
    rows: 6,
    obstacles: {
      size,
      columns: 6,
      rows: 6,
      blockedCells: new Set<string>(),
      solids: [],
      borders: [],
    },
    wanders,
  };
}

describe("the map of a guest (PRES-02)", () => {
  it("[PRES-02] is the same for the same guest, whatever the order of the maps", () => {
    const maps = ["garten", "saal", "kirche"];
    const pick = guestMapOf("u12", maps);
    expect(maps).toContain(pick);
    expect(guestMapOf("u12", [...maps].reverse())).toBe(pick);
    expect(guestMapOf("u12", maps)).toBe(pick);
  });

  it("[PRES-02] spreads the guests over the maps and has none without wander areas", () => {
    const maps = ["garten", "saal", "kirche"];
    const used = new Set(Array.from({ length: 60 }, (_, i) => guestMapOf(`u${String(i)}`, maps)));
    expect(used).toEqual(new Set(maps));
    expect(guestMapOf("u1", [])).toBeUndefined();
    expect(hashOf("a")).not.toBe(hashOf("b"));
  });
});

describe("where a figure may walk (PRES-02)", () => {
  it("[PRES-02] the wander cells are the walkable cells whose centre lies in a wander area", () => {
    const centre = cellCentre(2, 2, size);
    const area = [
      { x: centre.x - 5, y: centre.y - 5 },
      { x: centre.x + 5, y: centre.y - 5 },
      { x: centre.x + 5, y: centre.y + 5 },
      { x: centre.x - 5, y: centre.y + 5 },
    ];
    const map = openMap([area]);
    const cells = wanderCells(map, navigationGrid(map));
    expect(cells).toEqual([{ column: 2, row: 2 }]);
  });

  it("[PRES-02] a cell behind a collision is not a wander cell", () => {
    const centre = cellCentre(2, 2, size);
    const big = [
      { x: centre.x - 500, y: centre.y - 500 },
      { x: centre.x + 500, y: centre.y - 500 },
      { x: centre.x + 500, y: centre.y + 500 },
      { x: centre.x - 500, y: centre.y + 500 },
    ];
    const map = openMap([big]);
    const wall = [
      { x: centre.x - 4, y: centre.y - 4 },
      { x: centre.x + 4, y: centre.y - 4 },
      { x: centre.x + 4, y: centre.y + 4 },
      { x: centre.x - 4, y: centre.y + 4 },
    ];
    map.obstacles.solids.push(wall as never);
    const cells = wanderCells(map, navigationGrid(map));
    expect(cells.some((cell: Cell) => cell.column === 2 && cell.row === 2)).toBe(false);
    expect(cells.length).toBeGreaterThan(10);
    const { reachable } = reachableWanderCells(navigationGrid(map), cells, { column: 0, row: 0 });
    expect(reachable.length).toBe(cells.length);
  });
});

describe("the walk of a figure (PRES-02)", () => {
  const env = (route: WanderEnvironment["route"], walkable = true): WanderEnvironment => ({
    random: () => 0.5,
    isWalkable: () => walkable,
    route,
  });

  it("[PRES-02] waits 3 to 8 seconds", () => {
    expect(waitDuration(() => 0)).toBe(WAIT_MIN_MS);
    expect(waitDuration(() => 0.999999)).toBeLessThan(WAIT_MAX_MS);
    expect(waitDuration(() => 0.5)).toBe(5500);
  });

  it("[PRES-02] stands while it waits, then walks the route, faces the way it goes and waits again", () => {
    const figure = new Wanderer({ x: 0, y: 0 }, 1000);
    const route = (): { x: number; y: number }[] => [{ x: 20, y: 0 }];
    figure.update(500, 10, env(route));
    expect(figure.moving).toBe(false);
    expect(figure.position).toEqual({ x: 0, y: 0 });
    figure.update(600, 10, env(route));
    expect(figure.moving).toBe(true);
    expect(figure.direction).toBe("east");
    expect(figure.position.x).toBe(10);
    figure.update(100, 10, env(route));
    expect(figure.position.x).toBe(20);
    figure.update(100, 10, env(route));
    expect(figure.moving).toBe(false);
    expect(figure.path).toEqual([]);
    // After the walk it waits (5.5 s with this random number) before it asks for the next route.
    let asked = 0;
    const counting = env(() => {
      asked += 1;
      return undefined;
    });
    figure.update(5000, 10, counting);
    expect(asked).toBe(0);
    figure.update(600, 10, counting);
    expect(asked).toBe(1);
  });

  it("[PRES-02] gives a blocked walk up and waits", () => {
    const figure = new Wanderer({ x: 0, y: 0 }, 0);
    figure.update(
      100,
      10,
      env(() => [{ x: 50, y: 0 }], false),
    );
    expect(figure.moving).toBe(false);
    expect(figure.path).toEqual([]);
    expect(figure.position).toEqual({ x: 0, y: 0 });
  });
});
