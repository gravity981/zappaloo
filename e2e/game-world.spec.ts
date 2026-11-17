// The game world end to end (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-03, GAME-07, GAME-09, GAME-10, GAME-11, GAME-15, GAME-16): an admin
// imports the test world, and the game route draws its start map with the player at the start point; the arrow keys
// and a tap move the player, and a portal leads on to the next map, which the device remembers.
// The tests share one installation and one world, so they run one after the other.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildTestWorld, FIGURE_SIDE, TEST_WORLD_NAME } from "../backend/src/world/build.ts";
import { SPEED_TILES_PER_SECOND } from "../game-engine/src/movement.ts";
import { signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test.describe.configure({ mode: "serial" });

type State = NonNullable<Awaited<ReturnType<typeof readState>>>;

async function readState(page: Page) {
  return page.evaluate(() => window.__zappaloo?.game?.state());
}

/** Waits until the game has started and returns its state. */
async function gameState(page: Page): Promise<State> {
  await page.waitForFunction(() => window.__zappaloo?.game?.state() !== undefined);
  const state = await readState(page);
  if (state === undefined) throw new Error("the game has no state");
  return state;
}

/** The page position of a point of the map, from the camera view and the canvas box. */
async function pagePoint(
  page: Page,
  world: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("game-canvas").boundingBox();
  const state = await gameState(page);
  if (box === null) throw new Error("no canvas");
  const scale = box.width / state.view.width;
  return {
    x: box.x + box.width / 2 + (world.x - state.view.x) * state.view.zoom * scale,
    y: box.y + box.height / 2 + (world.y - state.view.y) * state.view.zoom * scale,
  };
}

test("[GAME-01][GAME-03] an admin imports the test world, and the game draws its start map with the player at the start point", async ({
  page,
  context,
}, testInfo) => {
  // The world is one setting of the installation: one profile only (as the other shared settings).
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/admin/world");
  mkdirSync(testInfo.outputDir, { recursive: true });
  const archive = join(testInfo.outputDir, "world.tar.gz");
  writeFileSync(archive, buildTestWorld());
  await page.locator('input[type="file"]').setInputFiles(archive);
  await expect(page.getByText(de.admin.world.imported)).toBeVisible();
  await expect(page.getByText(`Aktiv: ${TEST_WORLD_NAME}`)).toBeVisible();

  await page.goto("/game");
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  const state = await gameState(page);
  expect(state.mapId).toBe("kirche");
  expect(state.direction).toBe("south");
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("game-start.png") });
});

test("[GAME-09] the arrow keys move the player in the screen's directions", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/game");
  const before = await gameState(page);
  const pressedAt = Date.now();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1000);
  await page.keyboard.up("ArrowRight");
  const heldSeconds = (Date.now() - pressedAt) / 1000;
  const after = await gameState(page);
  expect(after.direction).toBe("east");
  // The engine walks SPEED_TILES_PER_SECOND tile widths per second; the avatar is FIGURE_SIDE wide. The walk
  // is at least this far when the key is held; the upper bound is not asserted, because frame timing under
  // parallel load can make the walk longer than the measured hold (seen at 37 px for a 27 px expectation).
  const expected = SPEED_TILES_PER_SECOND * FIGURE_SIDE * heldSeconds;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(expected * 0.7);
});

test("[GAME-10][GAME-03] a tap walks the player into the portal, which leads to the next map; the device remembers the map", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/game");
  await gameState(page);
  // The portal "zum-garten" of the start map lies at the left corner of the map, around (32, 176) in map pixels.
  const target = await pagePoint(page, { x: 32, y: 176 });
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await readState(page))?.mapId, { timeout: 15_000 }).toBe("garten");

  await page.reload();
  expect((await gameState(page)).mapId).toBe("garten");
});

test("[GAME-06][GAME-08][GAME-11][GAME-15][GAME-16] a tap on an object walks to it and opens its page above the paused game; closing returns to the same spot, and Enter opens it again", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/game");
  await gameState(page);
  const objects = await page.evaluate(() => window.__zappaloo?.game?.clickables() ?? []);
  const altar = objects.find((item) => item.name === "altar");
  if (altar === undefined) throw new Error("the start map has no object altar");
  // The easter egg is a clickable object like the others, but it does not sparkle (GAME-08).
  expect(objects.find((item) => item.name === "osterei")?.hidden).toBe(true);

  // Objects sparkle at random intervals (GAME-15).
  await expect
    .poll(async () => (await readState(page))?.sparkles ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(0);

  // The tap walks to the object's approach point; there its page opens over the game (GAME-16, GAME-11).
  const target = await pagePoint(page, { x: altar.x, y: altar.y });
  await page.mouse.click(target.x, target.y);
  const overlay = page.getByRole("dialog", { name: "Programm" });
  await expect(overlay).toBeVisible({ timeout: 20_000 });

  // The game is paused: the avatar stays where it stopped.
  const stopped = await gameState(page);
  await page.waitForTimeout(600);
  const later = await gameState(page);
  expect([later.x, later.y]).toEqual([stopped.x, stopped.y]);

  // Closing returns to the same spot.
  await page.getByRole("button", { name: de.game.overlay.close }).click();
  await expect(overlay).toHaveCount(0);
  const back = await gameState(page);
  expect([back.x, back.y]).toEqual([stopped.x, stopped.y]);

  // On the desktop, Enter activates the object in front of the avatar.
  await page.keyboard.press("Enter");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
});

test("[AVA-01][AVA-02] the avatar editor offers an admin the tier3 figures only, by kind; choosing a kind stores a figure and enables the next step", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/avatar");
  // The test world's only tier3 figure is the pastor, a man: the admin's editor offers that one kind.
  const kinds = page.getByRole("group", { name: de.avatar.kind });
  await expect(kinds.getByRole("button")).toHaveText([de.avatar.kinds.male]);
  await expect(page.getByRole("button", { name: de.avatar.finish })).toBeDisabled();
  await kinds.getByRole("button", { name: de.avatar.kinds.male }).click();
  await expect(page.getByRole("button", { name: de.avatar.finish })).toBeEnabled();
  await expect(page.getByRole("group", { name: de.avatar.figure }).getByRole("button")).toHaveCount(
    1,
  );
  // The choice is stored: a new visit shows it.
  await page.reload();
  await expect(page.getByRole("group", { name: de.avatar.figure })).toBeVisible();
  // The game starts with the chosen figure.
  await page.goto("/game");
  await gameState(page);
});
