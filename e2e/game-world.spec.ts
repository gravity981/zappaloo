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
  holdButton,
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

test("[GAME-24][GAME-28][GAME-29] a tap on the ground shows the marker while the avatar walks, and it is gone on arrival; the figure has a shadow and the clickable objects glow", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  const before = await gameState(page);
  // The clickable objects glow along their edges (GAME-29).
  expect(before.glows).toBeGreaterThan(0);
  expect(before.walk).toEqual({ marker: null, glow: null });
  // The shadow is an ellipse a hair below the figure's sprite (GAME-28).
  const stack = await page.evaluate(() => window.__zappaloo?.game?.renderStack() ?? []);
  const sprites = stack.filter((object) => object.type === "Sprite");
  const shadows = stack.filter((object) => object.type === "Ellipse");
  expect(
    shadows.some((shadow) =>
      sprites.some((sprite) => Math.abs(sprite.depth - shadow.depth - 0.001) < 1e-6),
    ),
  ).toBe(true);

  // A tap on the ground a few tiles away: the marker shows at its target while the avatar walks (GAME-24).
  const target = await pagePoint(page, { x: before.x + 70, y: before.y + 35 });
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(async () => (await gameState(page)).walk.marker, { timeout: 5_000 })
    .not.toBeNull();
  // The tap was on the ground, not on an object: nothing glows because of it.
  expect((await gameState(page)).walk.glow).toBeNull();
  await expect
    .poll(async () => (await gameState(page)).walk.marker, { timeout: 20_000 })
    .toBeNull();
  const after = await gameState(page);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
});

test("[GAME-10][GAME-03][GAME-30] a tap walks the player into the portal, which leads to the next map, behind a loading veil and with a screen flash; the device remembers the map", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  const first = await gameState(page);
  expect(first.entries).toBe(1);
  // Notes whether the grey loading veil is put up while the next map is built (GAME-30).
  await page.evaluate(() => {
    const seen = window as unknown as { sawLoadingVeil?: boolean };
    seen.sawLoadingVeil = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="map-loading"]') !== null)
        seen.sawLoadingVeil = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  // The portal "zum-garten" of the start map lies at the left corner of the map, around (32, 176) in map pixels.
  const target = await pagePoint(page, { x: 32, y: 176 });
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await readState(page))?.mapId, { timeout: 15_000 }).toBe("garten");
  // The veil was up, and it is gone once the map is ready; the map was entered with a flash, which counts an entry.
  expect(
    await page.evaluate(() => (window as unknown as { sawLoadingVeil?: boolean }).sawLoadingVeil),
  ).toBe(true);
  await expect(page.getByTestId("map-loading")).toHaveCount(0);
  await expect.poll(async () => (await readState(page))?.entries).toBe(2);

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

test("[GAME-26][GAME-06][GAME-16] an object outside the view has an indicator at the edge, the easter egg has none, and a tap on the indicator walks to the object and opens its page", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  // A phone-sized view shows only a small part of the map, so objects lie outside it. It is tall enough that the
  // indicator of the sexton (an NPC with an action, GAME-39) does not overlap the altar's, which it would hide.
  await page.setViewportSize({ width: 360, height: 420 });
  await signInAsAdmin(page, context);
  await enterGame(page);
  const before = await gameState(page);
  const indicators = page.getByTestId("edge-indicator");
  await expect(indicators.first()).toBeVisible({ timeout: 10_000 });
  // No indicator for the easter egg (GAME-08), and at most six (GAME-26).
  await expect(page.locator('[data-indicator="object:osterei"]')).toHaveCount(0);
  expect(await indicators.count()).toBeLessThanOrEqual(6);

  // Each indicator lies in the view, with a touch area of at least 44 x 44 pixels, 12 pixels from its edge.
  const canvas = await page.getByTestId("game-canvas").boundingBox();
  if (canvas === null) throw new Error("no canvas");
  for (const box of await indicators.evaluateAll((all) =>
    all.map((one) => {
      const rect = one.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
  )) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(canvas.x + 11);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y + 11);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width - 11);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height - 11);
  }

  // A tap on the indicator of the altar does what a tap on the altar does: the avatar walks there, and the page opens.
  const altar = page.locator('[data-indicator="object:altar"]');
  await expect(altar).toBeVisible();
  // The labels: the name of the object, or for a portal the name of the map it leads to, black on white (GAME-26).
  await expect(altar).toContainText("Programm");
  await expect(page.locator('[data-indicator="portal:zum-garten"]')).toContainText("Garten");
  const labelColors = await altar.locator("span").evaluate((span) => {
    const style = getComputedStyle(span);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(labelColors).toEqual({ color: "rgb(0, 0, 0)", background: "rgb(255, 255, 255)" });
  await altar.click();
  const overlay = page.getByRole("dialog", { name: "Programm" });
  await expect(overlay).toBeVisible({ timeout: 40_000 });
  const arrived = await gameState(page);
  expect(Math.hypot(arrived.x - before.x, arrived.y - before.y)).toBeGreaterThan(30);
  // The page is open above the paused game: no indicators over it (GAME-11).
  await expect(indicators.first()).toBeHidden();
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
  await page.getByLabel(de.admin.rsvpSettings.deadline).fill("31.12.2099");
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
  // The guest is signed in on the closed platform and lands on the Anmeldung, as in the RSVP test (RSVP-24).
  await expect(guest).toHaveURL(/\/rsvp$/);
  // The platform opens for guests now; it is closed again at the end, as the other tests expect it.
  await page.goto("/admin/settings");
  const opening = page.getByRole("region", { name: de.admin.waiting.openingTitle });
  await holdButton(page, opening.getByRole("button", { name: de.admin.waiting.openNow }));
  await expect(opening.getByText(de.admin.waiting.opened, { exact: true })).toBeVisible();
  await guest.goto("/game");
  await guest.getByRole("group", { name: de.avatar.kind }).getByRole("button").first().click();
  await guest.getByRole("button", { name: de.game.first.continue }).click();
  // The second step of the first entry is the profile ("Sag hallo"); it is skipped here.
  await guest.getByRole("button", { name: de.game.first.hello.skip }).click();

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
  const closing = page.getByRole("region", { name: de.admin.waiting.openingTitle });
  await holdButton(page, closing.getByRole("button", { name: de.admin.waiting.closeAgain }));
  // The test must not end before the platform is closed: this installation is shared with the tests that follow,
  // which expect it closed, and a request that the end of the test cuts off leaves it open.
  await expect(closing.getByText(de.admin.waiting.closed)).toBeVisible();
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
  // The bar has only the title and "Website" (GAME-14).
  const bar = page.getByRole("banner");
  await expect(bar.getByRole("link", { name: de.nav.site })).toBeVisible();
  await expect(bar.getByRole("button")).toHaveCount(0);
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

test("[PRES-01][PRES-02][PRES-04][PRES-08][AVA-04] the figures of the attending guests wander the wander areas of one map each, with their name tags, and the player keeps their own avatar", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  // The other guests come from the server (covered by its tests); here twelve of them are given to the browser.
  const guests = Array.from({ length: 12 }, (_, index) => ({
    id: `u${String(100 + index)}`,
    name: `Gast ${String(index + 1)}`,
    figure: "wedding-guest",
    greeting: null,
    badge: null,
    line: null,
    photo: null,
  }));
  await page.route("**/api/world/guests", (route) => route.fulfill({ json: { guests } }));
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  expect((await gameState(page)).guests).toEqual([]);

  // The test world has wander areas on two maps (garten, saal), none on the start map: every guest is on one of them.
  const names: string[] = [];
  for (const mapId of ["garten", "saal"]) {
    await page.evaluate((id) => window.__zappaloo?.game?.selectSpawn(id, "start"), mapId);
    await page.waitForFunction((id) => window.__zappaloo?.game?.state()?.mapId === id, mapId);
    const state = await gameState(page);
    names.push(...state.guests.map((guest) => guest.name));
  }
  expect(names.sort()).toEqual(guests.map((guest) => guest.name).sort());
  // The figures walk: after a while one of them has moved (they wait 0 to 8 s first, and 3 to 8 s between walks).
  const before = (await gameState(page)).guests;
  expect(before.length).toBeGreaterThan(0);
  await expect
    .poll(
      async () => {
        const now = (await gameState(page)).guests;
        return now.some((guest) => {
          const was = before.find((item) => item.id === guest.id);
          return was !== undefined && (was.x !== guest.x || was.y !== guest.y);
        });
      },
      { timeout: 25_000 },
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("game-guests.png") });
});

test("[PRES-10] a guest figure stands still and opens its speech bubble when the player comes close; a click pins it, a cross closes it", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  // One guest with a complete profile (no photo: the initials), so that the map it walks on can be found by its name.
  const guests = Array.from({ length: 4 }, (_, index) => ({
    id: `u${String(200 + index)}`,
    name: `Erika Huber ${String(index + 1)}`,
    figure: "wedding-guest",
    // Every second guest wrote no greeting: the bubble then says the default one.
    greeting: index % 2 === 0 ? "Hi, schön dich kennenzulernen!" : null,
    badge: "Freunde Braut",
    line: "WG-Gspänli aus Bern",
    photo: null,
  }));
  await page.route("**/api/world/guests", (route) => route.fulfill({ json: { guests } }));
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  // The guests are on the maps with wander areas; the first map that has one is the stage.
  for (const mapId of ["garten", "saal"]) {
    await page.evaluate((id) => window.__zappaloo?.game?.selectSpawn(id, "start"), mapId);
    await page.waitForFunction((id) => window.__zappaloo?.game?.state()?.mapId === id, mapId);
    if ((await gameState(page)).guests.length > 0) break;
  }
  const first = (await gameState(page)).guests[0];
  if (first === undefined) throw new Error("no guest on the map");
  const bubble = page.locator(`[data-testid="guest-bubble"][data-guest="${first.id}"]`);
  await expect(bubble).toHaveCount(0);

  // The player walks to the guest; within 2 tile widths its bubble opens with all that the profile says.
  await expect(async () => {
    // A click on the open bubble pins it, so the guest is clicked only while the bubble is closed.
    if (await bubble.isVisible()) return;
    const now = (await gameState(page)).guests.find((guest) => guest.id === first.id);
    if (now === undefined) throw new Error("guest gone");
    const target = await pagePoint(page, { x: now.x, y: now.y });
    await page.mouse.click(target.x, target.y);
    await expect(bubble).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(bubble).toContainText(first.name);
  await expect(bubble).toContainText(
    guests.find((guest) => guest.id === first.id)?.greeting ?? de.game.defaultGreeting,
  );
  await expect(bubble).toContainText("Freunde Braut");
  await expect(bubble).toContainText("WG-Gspänli aus Bern");
  // The figure stands still while its bubble is open.
  const standing = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect(standing).toMatchObject({ bubble: true, pinned: false });
  await page.waitForTimeout(1_200);
  const later = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect({ x: later?.x, y: later?.y, moving: later?.moving }).toEqual({
    x: standing?.x,
    y: standing?.y,
    moving: false,
  });
  await page.screenshot({ path: testInfo.outputPath("game-bubble.png") });

  // A click pins the bubble (a cross appears); it stays open when the player walks away.
  await bubble.click();
  await expect(bubble).toHaveAttribute("data-pinned", "true");
  // The player walks away with the arrow keys, in the first direction that leads far enough (the map has edges).
  const distance = async () => {
    const state = await gameState(page);
    return Math.hypot(state.x - (standing?.x ?? 0), state.y - (standing?.y ?? 0));
  };
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    if ((await distance()) > 3 * 64) break;
    await page.keyboard.down(key);
    await page.waitForTimeout(2_500);
    await page.keyboard.up(key);
  }
  expect(await distance()).toBeGreaterThan(3 * 64);
  await expect(bubble).toBeVisible();
  // The cross closes it, and the figure goes on strolling.
  await bubble.getByRole("button", { name: de.game.bubbleClose }).click();
  await expect(bubble).toHaveCount(0);
  const closed = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect(closed).toMatchObject({ bubble: false, pinned: false });
});

test("[PRES-05][PRES-06] the admin makes a table with its places in the seating plan, and the guest's table finder tells that no plan is visible yet", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/admin/seating");
  await expect(page.getByRole("heading", { name: de.admin.seating.title })).toBeVisible();
  // A table is a name and the number of places; the plan lives in Zappaloo, not in the game world.
  const form = page.getByRole("region", { name: de.admin.seating.newTable }).locator("form");
  await form.getByLabel(de.admin.seating.tableName).fill("Edelweiss");
  await form.getByLabel(de.admin.seating.tablePlaces).fill("8");
  await form.getByRole("button", { name: de.admin.seating.addTable }).click();
  await expect(page.getByTestId("table-Edelweiss")).toContainText("0 / 8");
  // Without a date the plan is hidden from guests; the table finder says so (the admin sees it like a guest).
  await page.goto("/seating");
  await expect(page.getByTestId("seating-hidden")).toBeVisible();
  await expect(page.getByText(de.seating.secretTitle)).toBeVisible();
});

test("[CNT-02][CNT-03][GAME-06] the admin writes the dialogue of an NPC in Erlebniswelt, and the player's tap on the NPC opens the dialogue box, which goes on line by line and closes", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  // The test world's object "pastor" opens the dialogue "npc-pastor" (a Tiled preset), which does not exist yet.
  await page.goto("/admin/world");
  await page.getByRole("button", { name: de.admin.world.tabDialogues }).click();
  await page.getByRole("button", { name: de.admin.dialogues.add }).click();
  await page.getByLabel(de.admin.dialogues.npcName).fill("Pfarrer Keller");
  await page.getByLabel(de.admin.dialogues.id).fill("npc-pastor");
  await page.getByLabel("Zeile 1", { exact: true }).fill("Grüss Gott! Schön, dass du da bist.");
  await page.getByRole("button", { name: de.admin.dialogues.addLine }).click();
  await page.getByLabel("Zeile 2", { exact: true }).fill("Die Trauung beginnt um **14:00**.");
  await page.getByRole("button", { name: de.admin.dialogues.save }).click();
  await expect(page.getByText(de.admin.dialogues.saved)).toBeVisible();
  // It is used by the object, which the editor says.
  await expect(page.getByText("kirche › pastor", { exact: false })).toBeVisible();

  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await gameState(page);
  const pastor = (await page.evaluate(() => window.__zappaloo?.game?.clickables()))?.find(
    (item) => item.name === "pastor",
  );
  if (pastor === undefined) throw new Error("the test world has no pastor");
  const box = page.getByTestId("dialogue-box");
  await expect(async () => {
    // A tap on the open box goes on to the next line, so the pastor is tapped only while the box is closed (the walk
    // to him can take longer than one attempt on a busy machine).
    if (await box.isVisible()) return;
    const target = await pagePoint(page, { x: pastor.x, y: pastor.y });
    await page.mouse.click(target.x, target.y);
    await expect(box).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000 });
  await expect(box).toContainText("Pfarrer Keller");
  await expect(box).toContainText("Grüss Gott! Schön, dass du da bist.");
  await expect(box).toContainText("1 / 2");
  // The game waits behind the box: the player stands still while it is open.
  const standing = await gameState(page);
  await page.waitForTimeout(600);
  const still = await gameState(page);
  expect({ x: still.x, y: still.y }).toEqual({ x: standing.x, y: standing.y });
  await page.screenshot({ path: testInfo.outputPath("game-dialogue.png") });
  // A tap goes on; the box shows the second line as Markdown; the last tap closes it.
  await page.getByTestId("dialogue-layer").click({ position: { x: 20, y: 20 } });
  await expect(box).toContainText("2 / 2");
  await expect(box.locator("strong")).toHaveText("14:00");
  await page.getByTestId("dialogue-layer").click({ position: { x: 20, y: 20 } });
  await expect(box).toHaveCount(0);
});

test("[GAME-31][GAME-33][GAME-34][MAP-20] the church has fog and cloud shadows, the indoor hall has none (map properties), and with reduced motion the fog stays and the shadows go", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  // The start map has a border, so it has fog, and the shadows drift over it.
  const church = await gameState(page);
  expect(church.mapId).toBe("kirche");
  expect(church.atmosphere.fog).toBe(true);
  expect(church.atmosphere.clouds).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("game-atmosphere.png") });
  // The hall switches clouds, birds and fog off (it is indoors).
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("saal", "start"));
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "saal");
  expect((await gameState(page)).atmosphere).toEqual({ fog: false, clouds: 0, birds: 0 });
  // The garden has no switch: everything is on.
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("garten", "start"));
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "garten");
  expect((await gameState(page)).atmosphere.clouds).toBeGreaterThanOrEqual(2);

  // A device that asks for reduced motion: no shadows and no birds, but the fog stays (it does not move).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/game");
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId !== undefined);
  const reduced = await gameState(page);
  expect(reduced.atmosphere.clouds).toBe(0);
  expect(reduced.atmosphere.birds).toBe(0);
  expect(reduced.atmosphere.fog).toBe(["kirche", "garten"].includes(reduced.mapId));
});

test("[GAME-32] now and then a flock of the world's bird flies through the view", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  // The first flock comes 20 to 60 seconds after the map is entered; with the lowest random number it is 20 seconds.
  await page.addInitScript(() => {
    Math.random = () => 0.01;
  });
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  expect((await gameState(page)).atmosphere.birds).toBe(0);
  await expect
    .poll(async () => (await gameState(page)).atmosphere.birds, {
      timeout: 40_000,
      intervals: [500],
    })
    .toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: testInfo.outputPath("game-birds.png") });
  // The flock leaves the view on the other side, and then there are none until the next one.
  await expect
    .poll(async () => (await gameState(page)).atmosphere.birds, {
      timeout: 40_000,
      intervals: [500],
    })
    .toBe(0);
});

test("[GAME-35][MAP-20] the fountain of the garden plays its animation, and with reduced motion it stands on its first frame", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  // The church has no animated object; the garden has the fountain, which cycles through its three pictures.
  expect((await gameState(page)).tileAnimation.objects).toBe(0);
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("garten", "start"));
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "garten");
  expect((await gameState(page)).tileAnimation.objects).toBe(1);
  const seen = new Set<number>();
  await expect
    .poll(
      async () => {
        for (const frame of (await gameState(page)).tileAnimation.frames) seen.add(frame);
        return seen.size;
      },
      { timeout: 10_000, intervals: [50] },
    )
    .toBe(3);
  await page.screenshot({ path: testInfo.outputPath("game-fountain.png") });

  // A device that asks for reduced motion: the fountain is not animated and stands on its first picture.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/game");
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "garten");
  expect((await gameState(page)).tileAnimation).toEqual({ objects: 0, frames: [] });
});

test("[GAME-36][MAP-20] the gardener walks his path to the end, waits there and walks back; the sexton stands and waves now and then", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  // With the lowest random number the first wave comes after 8 seconds, and the NPCs set off at once.
  await page.addInitScript(() => {
    Math.random = () => 0.01;
  });
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const npcs = async () => (await gameState(page)).npcs;
  const named = async (name: string) => (await npcs()).find((npc) => npc.name === name);

  // The church: the sexton stands where his point is, facing the player, and waves.
  expect(await gameState(page)).toMatchObject({ mapId: "kirche" });
  const sexton = await named("kuester");
  expect(sexton).toMatchObject({ figure: "herold", moving: false, tappable: true });
  expect(Math.abs((sexton?.x ?? 0) - 256)).toBeLessThanOrEqual(1);
  expect(Math.abs((sexton?.y ?? 0) - 176)).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await named("kuester"))?.waving, { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("game-npc-wave.png") });
  // He stays where he is; the church has no other NPC.
  expect((await named("kuester"))?.moving).toBe(false);
  expect(await npcs()).toHaveLength(1);

  // The garden: the gardener has no action, so a tap on him is a tap on the ground; he walks his path of 120 pixels.
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("garten", "start"));
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "garten");
  const start = await named("gaertner");
  expect(start).toMatchObject({ figure: "male-guest", tappable: false });
  // He starts at the first point of his path (he has already set off).
  expect(Math.abs((start?.x ?? 99) - 0)).toBeLessThanOrEqual(30);
  const xs: number[] = [];
  await expect
    .poll(
      async () => {
        const gardener = await named("gaertner");
        if (gardener === undefined) return -1;
        xs.push(gardener.x);
        return gardener.moving ? 0 : gardener.x;
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(115);
  // He walked there in small steps, not by jumping, and now waits at the end.
  expect(xs.some((x) => x > 20 && x < 100)).toBe(true);
  await expect
    .poll(async () => (await named("gaertner"))?.moving, { timeout: 15_000, intervals: [100] })
    .toBe(true);
  await expect
    .poll(async () => (await named("gaertner"))?.x ?? 999, { timeout: 15_000, intervals: [100] })
    .toBeLessThan(110);
  await page.screenshot({ path: testInfo.outputPath("game-npc-walk.png") });
});

test("[GAME-38][GAME-36] a tap on the sexton walks the player to him, he waits and glows meanwhile, and the programme opens; he has no sparkles", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const sexton = (await gameState(page)).npcs.find((npc) => npc.name === "kuester");
  if (sexton === undefined) throw new Error("the church has no sexton");
  // An NPC is no clickable object of the map: no sparkles, no shine, and no indicator while it is in view.
  const objects = (await page.evaluate(() => window.__zappaloo?.game?.clickables())) ?? [];
  expect(objects.some((object) => object.name === "kuester")).toBe(false);
  await expect(page.locator('[data-indicator="npc:kuester"]')).toHaveCount(0);
  expect((await gameState(page)).walk.glow).toBeNull();

  // A tap on his body: the walk starts, and he glows and waits (he does not walk on while the player is on the way).
  const body = async () => {
    const now = (await gameState(page)).npcs.find((npc) => npc.name === "kuester");
    if (now === undefined) throw new Error("the sexton is gone");
    return { now, target: await pagePoint(page, { x: now.x, y: now.y - 8 }) };
  };
  const first = await body();
  await page.mouse.click(first.target.x, first.target.y);
  const walking = await gameState(page);
  expect(walking.walk.glow).not.toBeNull();
  expect(walking.npcs.find((npc) => npc.name === "kuester")).toMatchObject({
    x: first.now.x,
    y: first.now.y,
  });
  // The page of the action opens above the game, named by the NPC's label (GAME-06).
  const dialog = page.getByRole("dialog", { name: "Küster" });
  await expect(async () => {
    if (await dialog.isVisible()) return;
    const again = await body();
    await page.mouse.click(again.target.x, again.target.y);
    await expect(dialog).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000 });
  // The page is open above the game, and the glow is gone with the walk.
  expect((await gameState(page)).walk.glow).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("game-npc-tap.png") });
});

/** Sets the name and the short dialog of the sexton of the church in Erlebniswelt (MAP-21); empty texts remove them. */
async function setSextonTexts(page: Page, title: string, dialog: string): Promise<void> {
  await page.goto("/admin/world");
  await page.getByRole("button", { name: de.admin.world.tabObjects }).click();
  await page.getByRole("button", { name: "Kirche" }).click();
  const block = page.getByTestId("npc-kuester");
  await block.getByLabel(/^Name/).fill(title);
  await block.getByLabel(/^Kurzer Dialog/).fill(dialog);
  await block.getByRole("button", { name: de.admin.world.npcs.save }).click();
  await expect(block.getByText(de.admin.world.npcs.saved)).toBeVisible();
}

test("[MAP-21][GAME-37] the admin gives the sexton a name and a short dialog; in the game his speech bubble opens, he stops and turns to the player, and a tap on the bubble opens his page", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  await signInAsAdmin(page, context);
  await setSextonTexts(page, "Küster Fritz", "Psst, hier entlang zum Programm!");

  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  expect((await gameState(page)).mapId).toBe("kirche");
  // The player starts within 3 tiles of him: his bubble opens with his name and his short dialog, and he stands still.
  const bubble = page.locator('[data-testid="guest-bubble"][data-guest="npc:kuester"]');
  await expect(bubble).toBeVisible({ timeout: 10_000 });
  await expect(bubble).toContainText("Küster Fritz");
  await expect(bubble).toContainText("Psst, hier entlang zum Programm!");
  const sexton = async () => (await gameState(page)).npcs.find((npc) => npc.name === "kuester");
  expect(await sexton()).toMatchObject({ bubble: true, moving: false, tappable: true });
  await page.screenshot({ path: testInfo.outputPath("game-npc-bubble.png") });
  // The gardener has no short dialog, so he has no bubble.
  await expect(page.locator('[data-testid="guest-bubble"][data-guest="npc:gaertner"]')).toHaveCount(
    0,
  );

  // A tap on the bubble does what a tap on the NPC does: his action runs, a page above the game named by his name.
  const dialog = page.getByRole("dialog", { name: "Küster Fritz" });
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await bubble.click();
    await expect(dialog).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000 });
  // The bubbles are hidden while a page is open above the game (GAME-11).
  await expect(bubble).toBeHidden();

  // The texts are live at the next load; emptied, the bubble is gone, and the label of Tiled names him again.
  await setSextonTexts(page, "", "");
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await gameState(page)).npcs.length).toBeGreaterThan(0);
  await expect(bubble).toHaveCount(0);
});

test("[GAME-39][GAME-37] an NPC with an action outside the view has an indicator labelled with his name; a tap on it walks to him and opens his page", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  await signInAsAdmin(page, context);
  await setSextonTexts(page, "Küster Fritz", "");
  // A phone-sized view shows only a small part of the map, so the sexton lies outside it.
  await page.setViewportSize({ width: 320, height: 520 });
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const indicator = page.locator('[data-indicator="npc:kuester"]');
  await expect(indicator).toBeVisible({ timeout: 10_000 });
  await expect(indicator).toContainText("Küster Fritz");
  // He has no short dialog now, so no bubble opens even if the player is near him.
  await expect(page.locator('[data-testid="guest-bubble"][data-guest="npc:kuester"]')).toHaveCount(
    0,
  );
  // The gardener has no action, so he has no indicator, in the garden or here.
  await expect(page.locator('[data-indicator="npc:gaertner"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("game-npc-indicator.png") });
  await indicator.click();
  await expect(page.getByRole("dialog", { name: "Küster Fritz" })).toBeVisible({ timeout: 40_000 });
  // The page is open above the paused game: no indicator over it (GAME-11).
  await expect(indicator).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 720 });
  await setSextonTexts(page, "", "");
});
