// The game world end to end (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-03, GAME-07, GAME-09, GAME-10, GAME-11, GAME-15, GAME-16): an admin
// imports the test world, and the game route draws its start map with the player at the start point; the arrow keys
// and a tap move the player, and a portal leads on to the next map, which the device remembers.
// The tests share one installation and one world, so they run one after the other.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildTestWorld, FIGURE_SIDE, TEST_WORLD_NAME } from "../backend/src/world/build.ts";
import { SPEED_TILES_PER_SECOND } from "../game-engine/src/movement.ts";
import {
  chooseFirstFigure,
  clientAddress,
  PASSWORD,
  signInAsAdmin,
  stayOnWebsite,
} from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test.describe.configure({ mode: "serial" });

/** Opens the game as the signed-in user, who has chosen a figure (the first-entry avatar step is tested apart). */
async function enterGame(page: Page): Promise<void> {
  await chooseFirstFigure(page);
  await page.goto("/game");
}

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

/**
 * Taps an object once the camera has settled: the view is read twice, a moment apart, and must be the same. The
 * canvas is sized after it is drawn, so a tap made earlier would aim at a view that is still moving.
 */
async function tapSettledObject(page: Page, object: { x: number; y: number }): Promise<void> {
  await expect
    .poll(
      async () => {
        const first = JSON.stringify((await gameState(page)).view);
        await page.waitForTimeout(250);
        return first === JSON.stringify((await gameState(page)).view);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  // A tap can still miss the walk's start on a busy machine, so it is made again with a fresh target until the
  // page opens (bounded). One tap alone proved too little in the full run.
  await expect(async () => {
    const target = await pagePoint(page, object);
    await page.mouse.click(target.x, target.y);
    await expect(page.getByRole("dialog", { name: "Programm" })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000 });
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

  await enterGame(page);
  // The first load of the game fetches the Phaser chunk, which takes longer on a busy machine.
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
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
  await enterGame(page);
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
  await enterGame(page);
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
  await enterGame(page);
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
  const overlay = page.getByRole("dialog", { name: "Programm" });
  await tapSettledObject(page, altar);
  await expect(overlay).toBeVisible({ timeout: 10_000 });

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

  // On the desktop, Enter activates the object that the avatar's reach picks. Enter is pressed once the altar is that
  // object: the avatar walks to the altar's approach point and stops there; the test hook says which object is in reach.
  const altarInReach = async () => {
    const objects = await page.evaluate(() => window.__zappaloo?.game?.clickables() ?? []);
    return objects.find((item) => item.reachable)?.name === "altar";
  };
  await expect(async () => {
    if (!(await altarInReach())) {
      const target = await pagePoint(page, { x: altar.ax, y: altar.ay });
      await page.mouse.click(target.x, target.y);
      // The walk takes a few seconds: it is waited for, and the tap is repeated only when it did not get there.
      await expect.poll(altarInReach, { timeout: 5_000 }).toBe(true);
    }
  }).toPass({ timeout: 40_000 });
  await page.keyboard.press("Enter");
  await expect(overlay).toBeVisible();
  // The key may arrive before the overlay listens for it: press again until it closes.
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0, { timeout: 1000 });
  }).toPass();
});

test("[GAME-11] Enter on the close button of an object's page closes it, and the object does not open again", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  await gameState(page);
  const objects = await page.evaluate(() => window.__zappaloo?.game?.clickables() ?? []);
  const altar = objects.find((item) => item.name === "altar");
  if (altar === undefined) throw new Error("the start map has no object altar");
  const overlay = page.getByRole("dialog", { name: "Programm" });
  await tapSettledObject(page, altar);
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  // Enter on the focused close button closes the page; the game must not take the same press as a new activation.
  const close = page.getByRole("button", { name: de.game.overlay.close });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(overlay).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(overlay).toHaveCount(0);
});

test("[GAME-11][GAME-13] on the first entry with an open RSVP, typing into the RSVP's field types there and the avatar stays where it is", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  const name = `E2E Spiel ${suffix}`;
  const username = `spiel${suffix}`;

  // An admin opens the RSVP and invites a guest, as in the RSVP test.
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  await page.getByLabel(de.admin.rsvpSettings.deadline).fill("2099-12-31");
  await page.getByRole("button", { name: de.admin.rsvpSettings.saveDeadline }).click();
  await expect(
    page.getByRole("status").filter({ hasText: de.admin.rsvpSettings.saved }),
  ).toBeVisible();
  await page.goto("/admin/invitations");
  await page.getByLabel(de.admin.invitations.names).fill(name);
  await page.getByRole("button", { name: /Einladung erstellen/ }).click();
  const codeCell = page.locator(".invitation-code");
  await expect(codeCell).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeCell.textContent()) ?? "";

  // The guest redeems the invitation in a browser of their own and enters the game for the first time.
  const guestContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  await stayOnWebsite(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${code}`);
  await guest.getByLabel(de.invite.username).fill(username);
  await guest.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await guest.getByRole("button", { name: de.invite.register }).click();
  // The guest is signed in on the closed platform, as in the RSVP test: the waiting page links to the answer.
  await expect(guest.getByRole("link", { name: de.waiting.answer })).toBeVisible();
  // The platform opens for guests now; it is closed again at the end, as the other tests expect it.
  await page.goto("/admin/settings");
  const opening = page.getByRole("region", { name: de.admin.waiting.openingTitle });
  await opening.getByRole("button", { name: de.admin.waiting.openNow }).click();
  await expect(opening.getByText(de.admin.waiting.opened, { exact: true })).toBeVisible();
  await guest.goto("/game");
  await guest.getByRole("group", { name: de.avatar.kind }).getByRole("button").first().click();
  await guest.getByRole("button", { name: de.game.first.continue }).click();

  // The RSVP opens above the game; the answer leads to the text field of the allergies.
  const rsvp = guest.getByRole("dialog", { name: de.nav.rsvp });
  await expect(rsvp).toBeVisible();
  await guest.getByRole("button", { name: de.rsvp.yes, exact: true }).click();
  await guest.getByRole("button", { name: de.rsvp.next }).click();
  await guest.getByRole("button", { name: "Vegetarisch" }).click();
  const field = guest.getByLabel(de.rsvp.allergies);
  await field.click();
  const before = await gameState(guest);
  await guest.keyboard.type("wasd");
  await guest.waitForTimeout(600);
  await expect(field).toHaveValue("wasd");
  const after = await gameState(guest);
  expect([after.x, after.y]).toEqual([before.x, before.y]);
  await guestContext.close();
  await page.goto("/admin/settings");
  await page
    .getByRole("region", { name: de.admin.waiting.openingTitle })
    .getByRole("button", { name: de.admin.waiting.closeAgain })
    .click();
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
  await expect(
    page.getByRole("group", { name: de.avatar.figure, exact: true }).getByRole("button"),
  ).toHaveCount(1);
  // The choice is stored: a new visit shows it.
  await page.reload();
  await expect(page.getByRole("group", { name: de.avatar.figure, exact: true })).toBeVisible();
  // The game starts with the chosen figure.
  await enterGame(page);
  await gameState(page);
});

test("[GAME-12][GAME-13][GAME-14][GAME-17][GAME-18] first entry: the avatar comes first, then the game with its bar and hint; the own avatar opens the profile; the sign-in lands in the game and Website leaves it", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  // Nothing chosen yet: the avatar editor, no game, "Weiter" waits for a figure.
  await page.goto("/game");
  await expect(page.getByRole("heading", { name: de.avatar.title })).toBeVisible();
  await expect(page.getByTestId("game-canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: de.game.first.continue })).toBeDisabled();
  await page.getByRole("group", { name: de.avatar.kind }).getByRole("button").first().click();
  await page.getByRole("button", { name: de.game.first.continue }).click();

  // The game: the bar at the top, the hint for newcomers.
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  const bar = page.getByRole("navigation", { name: de.game.bar.label });
  await expect(bar.getByRole("button", { name: de.nav.programme })).toBeVisible();
  await expect(page.getByRole("link", { name: de.nav.site })).toBeVisible();
  await expect(page.getByTestId("game-hint")).toBeVisible();

  // A tap on the own avatar opens the profile above the game.
  const state = await gameState(page);
  // The sprite stands on its feet point (offset by the anchor); its body is about 16 pixels high.
  const own = await pagePoint(page, { x: state.x - 3, y: state.y + 2 });
  await page.mouse.click(own.x, own.y);
  await expect(page.getByRole("dialog", { name: de.nav.profile })).toBeVisible();
  await page.getByRole("button", { name: de.game.overlay.close }).click();

  // "Website" leaves the game; the start page offers the way back.
  await page.getByRole("link", { name: de.nav.site }).click();
  await expect(page.getByRole("link", { name: de.website.enterWorld })).toBeVisible();

  // The next sign-in start (`/` in a new session) lands in the game.
  await page.evaluate(() => {
    sessionStorage.clear();
  });
  await page.goto("/");
  await expect(page.getByTestId("game-canvas")).toBeVisible();
});

test("[GAME-21] the game fills a phone's screen and is a window of at most 1280 x 800 on a wide screen", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await chooseFirstFigure(page);
  const window = page.locator(".game-window");

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/game");
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  expect(await window.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 780 });

  await page.setViewportSize({ width: 1900, height: 1200 });
  await expect(window).toHaveCSS("width", "1280px");
  await expect(window).toHaveCSS("height", "800px");

  await page.setViewportSize({ width: 1000, height: 700 });
  expect(await window.boundingBox()).toMatchObject({ width: 1000, height: 700 });
});

test("[MAP-19] an admin switches guest access off and on again in Welt & Import; the active world stays", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/admin/world");
  const toggle = page.getByRole("switch", { name: de.admin.world.guestAccess });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(`Aktiv: ${TEST_WORLD_NAME}`)).toBeVisible();
  // The setting is stored, and an admin still reaches the game.
  await page.reload();
  await expect(page.getByRole("switch", { name: de.admin.world.guestAccess })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await chooseFirstFigure(page);
  await page.goto("/game");
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  // Back on, so that the other tests find the installation as they left it.
  await page.goto("/admin/world");
  await page.getByRole("switch", { name: de.admin.world.guestAccess }).click();
  await expect(page.getByRole("switch", { name: de.admin.world.guestAccess })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
