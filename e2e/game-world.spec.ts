// The game world end to end (sw-architecture.md 3.1, 3.5, 14.4; GAME-01, GAME-03, GAME-07, GAME-09, GAME-10, GAME-11, GAME-15, GAME-16): an admin
// imports the test world, and the game route draws its start map with the player at the start point; the arrow keys
// and a tap move the player, and a portal leads on to the next map, which the device remembers.
// The world is imported once before the run (e2e/global-setup.ts); the tests run in the project "game", one worker,
// and do not depend on each other. A test that changes a shared setting is put back by the hook below, also on failure.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { dialogueSlug } from "../backend/src/dialogue/id.ts";
import { buildTestWorld, TEST_WORLD_NAME } from "../backend/src/world/build.ts";
import {
  chooseFirstFigure,
  clientAddress,
  holdButton,
  PASSWORD,
  signInAsAdmin,
  stayOnWebsite,
} from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

/**
 * After every test the settings that tests change are as the others expect them: guest access on, the sexton back at his
 * preset action and the indicators of the altar, the sexton and osterei on, and the dialogues that tests made for him gone (MAP-19, MAP-21,
 * GAME-41). A test that fails halfway has not put them back itself. The API is used, not the pages: it is quick, and
 * works after a timeout. The admin is a fresh one, because the test's own session may be gone.
 */
test.afterEach(async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  try {
    const page = await context.newPage();
    await signInAsAdmin(page, context);
    const headers = await csrfHeaders(page);
    await page.request.put("/api/admin/world/guest-access", { headers, data: { enabled: true } });
    await assignAction(page, "kirche", "kuester", null);
    await assignAction(page, "kirche", "altar", null);
    for (const object of ["altar", "kuester", "osterei"]) {
      await page.request.put(`/api/admin/world/objects/kirche/${object}/indicator`, {
        headers,
        data: { showIndicator: true },
      });
    }
    // A dialogue that no object shows any more can go; the pastor's stays, its preset in Tiled names it.
    for (const name of SEXTON_DIALOGUES) {
      await page.request.delete(`/api/admin/dialogues/${dialogueSlug(name)}`, { headers });
    }
  } finally {
    await context.close();
  }
});

/** The figure names of the dialogues that tests make for the sexton, which the hook above removes. */
const LONG_NAME = "Anreise, Parkplätze und Haltestellen rund um die Kirche";
const SEXTON_DIALOGUES = ["Küster Fritz", "Wirt", LONG_NAME];

/** The CSRF header of the signed-in user, for the requests that change something. */
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const session = (await (await page.request.get("/api/session")).json()) as { csrfToken: string };
  return { "x-csrf-token": session.csrfToken };
}

/** Turns the edge indicator of an object or NPC of the church map on or off (GAME-41, the setting showIndicator). */
async function setIndicator(page: Page, object: string, showIndicator: boolean): Promise<void> {
  const result = await page.request.put(`/api/admin/world/objects/kirche/${object}/indicator`, {
    headers: await csrfHeaders(page),
    data: { showIndicator },
  });
  if (!result.ok()) throw new Error(`setting the indicator failed: ${await result.text()}`);
}

/**
 * Makes a dialogue through the API, as a test needs it, and returns its id: the id the admin area makes from the
 * name (CNT-09). One that exists is changed to what the test wants.
 */
async function ensureDialogue(
  page: Page,
  name: string,
  greeting: string,
  lines = ["Willkommen!"],
): Promise<string> {
  const id = dialogueSlug(name);
  const headers = await csrfHeaders(page);
  const known = await page.request.get(`/api/admin/dialogues/${id}`);
  const data = { npcName: name, greeting, lines };
  const result = known.ok()
    ? await page.request.put(`/api/admin/dialogues/${id}`, { headers, data })
    : await page.request.post("/api/admin/dialogues", { headers, data });
  if (!result.ok()) throw new Error(`the dialogue ${name} was refused: ${await result.text()}`);
  return id;
}

/** Assigns an action to an object or NPC through the API; null returns to its preset. */
async function assignAction(
  page: Page,
  map: string,
  object: string,
  action: { kind: "dialog"; dialogId: string } | { kind: "page"; page: string } | null,
): Promise<void> {
  const result = await page.request.put(`/api/admin/world/objects/${map}/${object}`, {
    headers: await csrfHeaders(page),
    data: { action },
  });
  if (!result.ok()) throw new Error(`assigning the action failed: ${await result.text()}`);
}

/** Opens the game as the signed-in user, who has chosen a figure (the first-entry avatar step is tested apart). */
async function enterGame(page: Page, query = ""): Promise<void> {
  await chooseFirstFigure(page);
  await page.goto(`/game${query}`);
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
 * Plays `ms` of game time (frames of 1/60 s). The first call stops the game's own clock for the rest of the test: the
 * game then moves only by what is advanced here, so that a walk takes the same game time on a busy machine as on a
 * quiet one. Wall-clock waits are what made the game tests flaky (spec/test-strategy.md 8.8).
 */
async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((time) => {
    window.__zappaloo?.game?.advance(time);
  }, ms);
}

/** Plays game time, `step` at a time, until the condition holds; fails when `limit` of game time has passed. */
async function advanceUntil(
  page: Page,
  done: () => Promise<boolean>,
  limit = 30_000,
  step = 100,
): Promise<void> {
  for (let played = 0; played <= limit; played += step) {
    if (await done()) return;
    await advance(page, step);
  }
  throw new Error(`the game did not get there in ${String(limit)} ms of game time`);
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

test(
  "[GAME-01][GAME-03] an admin imports the test world, and the game draws its start map with the player at the start point",
  { tag: "@smoke" },
  async ({ page, context }, testInfo) => {
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
  },
);

test(
  "[GAME-09] the arrow keys move the player in the screen's directions",
  { tag: "@smoke" },
  async ({ page, context }) => {
    await signInAsAdmin(page, context);
    await enterGame(page);
    const before = await gameState(page);
    await page.keyboard.down("ArrowRight");
    await advance(page, 1000);
    await page.keyboard.up("ArrowRight");
    const after = await gameState(page);
    expect(after.direction).toBe("east");
    // The right arrow walks to the right on the screen: the player moved, to the right (x grows) and the walk is
    // mostly horizontal. The game time is advanced by hand, so the machine's load does not matter. The directions and the equal speed of diagonal moves are tested in
    // movement.test.ts (GAME-09).
    expect(after.x - before.x).toBeGreaterThan(4);
    expect(Math.abs(after.y - before.y)).toBeLessThan(Math.abs(after.x - before.x));
  },
);

test("[GAME-24][GAME-28][GAME-29] a tap on the ground shows the marker while the avatar walks, and it is gone on arrival; the figure has a shadow and the clickable objects glow", async ({
  page,
  context,
}) => {
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

test("[GAME-10][GAME-03][GAME-30] a tap walks the player into the portal, which leads to the next map, after a white-out, behind a loading veil and with a screen flash; the device remembers the map", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  await enterGame(page);
  const first = await gameState(page);
  expect(first.entries).toBe(1);
  // Notes whether the grey loading veil is put up while the next map is built (GAME-30).
  await page.evaluate(() => {
    const seen = window as unknown as { sawLoadingVeil?: boolean; sawWhiteout?: boolean };
    seen.sawLoadingVeil = false;
    seen.sawWhiteout = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="map-loading"]') !== null)
        seen.sawLoadingVeil = true;
      if (document.querySelector('[data-testid="map-whiteout"]') !== null) seen.sawWhiteout = true;
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
  // The screen was white before the new map was loaded, and that white is gone once the map is ready (GAME-30).
  expect(
    await page.evaluate(() => (window as unknown as { sawWhiteout?: boolean }).sawWhiteout),
  ).toBe(true);
  await expect(page.getByTestId("map-loading")).toHaveCount(0);
  await expect(page.getByTestId("map-whiteout")).toHaveCount(0);
  await expect.poll(async () => (await readState(page))?.entries).toBe(2);

  await page.reload();
  expect((await gameState(page)).mapId).toBe("garten");
});

test("[GAME-06][GAME-08][GAME-11][GAME-15][GAME-16] a tap on an object walks to it and opens its page above the paused game; closing returns to the same spot, and Enter opens it again", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  await enterGame(page);
  await gameState(page);
  const objects = await page.evaluate(() => window.__zappaloo?.game?.clickables() ?? []);
  const altar = objects.find((item) => item.name === "altar");
  if (altar === undefined) throw new Error("the start map has no object altar");
  // The object osterei is hidden in the map: it does not sparkle (GAME-08).
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

test("[GAME-26][GAME-06][GAME-16] an object outside the view has an indicator at the edge, an object whose indicator is off has none, and a tap on the indicator walks to the object and opens its page", async ({
  page,
  context,
}) => {
  // A phone-sized view shows only a small part of the map, so objects lie outside it. The sexton's indicator is off
  // here: where two indicators would overlap, the nearer one hides the other (GAME-41), which would hide the altar's.
  await page.setViewportSize({ width: 360, height: 420 });
  await signInAsAdmin(page, context);
  await setIndicator(page, "kuester", false);
  // Only the setting showIndicator decides for an object, whatever it is: the object osterei, turned off here, has none.
  await setIndicator(page, "osterei", false);
  await enterGame(page);
  const before = await gameState(page);
  const indicators = page.getByTestId("edge-indicator");
  await expect(indicators.first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-indicator="object:osterei"]')).toHaveCount(0);
  // At most six indicators (GAME-26).
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
  // The sexton is near the start, and his speech bubble can lie over the altar's indicator: the click goes to the
  // indicator itself, which is what is tested here, whatever floats over it.
  await altar.dispatchEvent("click");
  const overlay = page.getByRole("dialog", { name: "Programm" });
  await advanceUntil(page, () => overlay.isVisible(), 40_000);
  const arrived = await gameState(page);
  expect(Math.hypot(arrived.x - before.x, arrived.y - before.y)).toBeGreaterThan(30);
  // The page is open above the paused game: no indicators over it (GAME-11).
  await expect(indicators.first()).toBeHidden();
});

test("[GAME-11] Enter on the close button of an object's page closes it, and the object does not open again", async ({
  page,
  context,
}) => {
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
  await advance(page, 800);
  await expect(overlay).toHaveCount(0);
});

test("[GAME-11][GAME-13] on the first entry with an open RSVP, typing into the RSVP's field types there and the avatar stays where it is", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
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
  await advance(guest, 600);
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
}) => {
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

test("[GAME-12][GAME-13][GAME-14][GAME-17] first entry: the avatar comes first, then the game with its bar and no hint; the own avatar opens nothing; the sign-in lands in the game and Website leaves it", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  // Nothing chosen yet: the avatar editor, no game, "Weiter" waits for a figure.
  await page.goto("/game");
  await expect(page.getByRole("heading", { name: de.avatar.title })).toBeVisible();
  await expect(page.getByTestId("game-canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: de.game.first.continue })).toBeDisabled();
  await page.getByRole("group", { name: de.avatar.kind }).getByRole("button").first().click();
  await page.getByRole("button", { name: de.game.first.continue }).click();

  // The game: the bar at the top.
  await expect(page.getByTestId("game-canvas")).toBeVisible();
  // The bar has only the title and "Website" (GAME-14).
  const bar = page.getByRole("banner");
  await expect(bar.getByRole("link", { name: de.nav.site })).toBeVisible();
  await expect(bar.getByRole("button")).toHaveCount(0);
  // The hint of earlier versions is gone (GAME-17: without a welcome dialogue nothing is shown).
  await expect(page.getByText(/die funkeln/)).toHaveCount(0);

  // A tap on the own avatar opens nothing: the profile is reached through the website (GAME-18 withdrawn).
  const state = await gameState(page);
  // The sprite stands on its feet point (offset by the anchor); its body is about 16 pixels high.
  const own = await pagePoint(page, { x: state.x - 3, y: state.y + 2 });
  await page.mouse.click(own.x, own.y);
  await expect(page.getByRole("dialog")).toHaveCount(0);

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
}) => {
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
}) => {
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
  await advanceUntil(
    page,
    async () => {
      // A click on the open bubble pins it, so the guest is clicked only while the bubble is closed.
      if (await bubble.isVisible()) return true;
      const state = await gameState(page);
      // A walk that is still going is left to arrive: a second click next to the guest would pin the bubble.
      if (state.walk.marker !== null) return false;
      const now = state.guests.find((guest) => guest.id === first.id);
      if (now === undefined) throw new Error("guest gone");
      const target = await pagePoint(page, { x: now.x, y: now.y });
      await page.mouse.click(target.x, target.y);
      return false;
    },
    60_000,
  );
  await expect(bubble).toContainText(first.name);
  await expect(bubble).toContainText(
    guests.find((guest) => guest.id === first.id)?.greeting ?? de.game.defaultGreeting,
  );
  await expect(bubble).toContainText("Freunde Braut");
  await expect(bubble).toContainText("WG-Gspänli aus Bern");
  // The figure stands still while its bubble is open.
  const standing = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect(standing).toMatchObject({ bubble: true, pinned: false });
  await advance(page, 1_200);
  const later = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect({ x: later?.x, y: later?.y, moving: later?.moving }).toEqual({
    x: standing?.x,
    y: standing?.y,
    moving: false,
  });
  await page.screenshot({ path: testInfo.outputPath("game-bubble.png") });

  // A click pins the bubble (a cross appears); it stays open when the player walks away.
  await bubble.click();
  await advance(page, 100);
  await expect(bubble).toHaveAttribute("data-pinned", "true");
  // The player walks away with the arrow keys, in the first direction that leads far enough (the map has edges).
  const distance = async () => {
    const state = await gameState(page);
    return Math.hypot(state.x - (standing?.x ?? 0), state.y - (standing?.y ?? 0));
  };
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    if ((await distance()) > 3 * 64) break;
    await page.keyboard.down(key);
    await advance(page, 2_500);
    await page.keyboard.up(key);
  }
  expect(await distance()).toBeGreaterThan(3 * 64);
  await expect(bubble).toBeVisible();
  // The cross closes it, and the figure goes on strolling.
  await bubble.getByRole("button", { name: de.game.bubbleClose }).click();
  await advance(page, 100);
  await expect(bubble).toHaveCount(0);
  const closed = (await gameState(page)).guests.find((guest) => guest.id === first.id);
  expect(closed).toMatchObject({ bubble: false, pinned: false });
});

test("[PRES-05][PRES-06] the admin makes a table with its places in the seating plan, and the guest's table finder tells that no plan is visible yet", async ({
  page,
  context,
}) => {
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

test("[CNT-02][CNT-03][CNT-10][GAME-06] the admin writes the dialogue of an NPC in Erlebniswelt, and the player's tap on the NPC opens the dialogue box, which types its lines, shows an arrow when a page is complete, goes on line by line and closes", async ({
  page,
  context,
}, testInfo) => {
  await signInAsAdmin(page, context);
  // The test world's object "pastor" opens the dialogue "pfarrer-keller" (a Tiled preset), which does not exist yet.
  const lines = ["Grüss Gott! Schön, dass du da bist.", "Die Trauung beginnt um **14:00**."];
  const known = await page.request.get("/api/admin/dialogues/pfarrer-keller");
  if (known.ok()) {
    // A retry: the dialogue of the first attempt is still there (the pastor object uses it, so it cannot be
    // deleted). Its content is put back, and the rest of the test runs as usual.
    const session = (await (await page.request.get("/api/session")).json()) as {
      csrfToken: string;
    };
    const put = await page.request.put("/api/admin/dialogues/pfarrer-keller", {
      headers: { "x-csrf-token": session.csrfToken },
      data: { npcName: "Pfarrer Keller", greeting: "", lines },
    });
    expect(put.ok()).toBe(true);
  } else {
    await page.goto("/admin/world");
    await page.getByRole("button", { name: de.admin.world.tabDialogues }).click();
    await page.getByRole("button", { name: de.admin.dialogues.add }).click();
    await page.getByLabel(de.admin.dialogues.npcName).fill("Pfarrer Keller");
    await page.getByLabel("Zeile 1", { exact: true }).fill(lines[0] ?? "");
    await page.getByRole("button", { name: de.admin.dialogues.addLine }).click();
    await page.getByLabel("Zeile 2", { exact: true }).fill(lines[1] ?? "");
    await page.getByRole("button", { name: de.admin.dialogues.save }).click();
    await expect(page.getByText(de.admin.dialogues.saved)).toBeVisible();
    // The id was made from the name (CNT-09) and is shown, read-only; the preset in Tiled names it.
    await expect(page.getByLabel(de.admin.dialogues.id)).toHaveValue("pfarrer-keller");
    // It is used by the object, which the editor says.
    await expect(page.getByText("kirche › pastor", { exact: false })).toBeVisible();
  }

  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await gameState(page);
  const pastor = (await page.evaluate(() => window.__zappaloo?.game?.clickables()))?.find(
    (item) => item.name === "pastor",
  );
  if (pastor === undefined) throw new Error("the test world has no pastor");
  const box = page.getByTestId("dialogue-box");
  await advanceUntil(
    page,
    async () => {
      // A tap on the open box goes on to the next line, so the pastor is tapped only while the box is closed and
      // the player is not on the way to him.
      if (await box.isVisible()) return true;
      if ((await gameState(page)).walk.marker !== null) return false;
      const target = await pagePoint(page, { x: pastor.x, y: pastor.y });
      await page.mouse.click(target.x, target.y);
      return false;
    },
    60_000,
  );
  await expect(box).toContainText("Pfarrer Keller");
  await expect(box).toContainText("Grüss Gott! Schön, dass du da bist.");
  await expect(box).toContainText("1 / 2");
  // The game waits behind the box: the player stands still while it is open.
  const standing = await gameState(page);
  await advance(page, 600);
  const still = await gameState(page);
  expect({ x: still.x, y: still.y }).toEqual({ x: standing.x, y: standing.y });
  await page.screenshot({ path: testInfo.outputPath("game-dialogue.png") });
  // A tap goes on; the box shows the second line as Markdown; the last tap closes it. The box ignores a tap right
  // after it opened (it belongs to what opened it) and says when it takes them: the test waits for that state, not
  // for the clock (a tap that came too soon was lost in CI, where the advanced game time takes no real time).
  await expect(box).toHaveAttribute("data-settled", "true");
  // The line types itself out (CNT-10); once the whole page is there, the arrow bounces and a tap goes on. (A tap
  // while it types would only complete the page, so the test waits for the end of the typing.)
  const layer = page.getByTestId("dialogue-layer");
  await expect(layer).toHaveAttribute("data-typing", "false");
  await expect(box.locator(".dialogue-next")).toHaveAttribute("data-visible", "true");
  await layer.click({ position: { x: 20, y: 20 } });
  await expect(box).toContainText("2 / 2");
  await expect(box.locator("strong")).toHaveText("14:00");
  await page.getByTestId("dialogue-layer").click({ position: { x: 20, y: 20 } });
  await expect(box).toHaveCount(0);
});

test("[GAME-31][GAME-33][GAME-34][MAP-20] the church has fog and cloud shadows, the indoor hall has none (map properties), and with reduced motion the fog stays and the shadows go", async ({
  page,
  context,
}, testInfo) => {
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
  // The first flock comes 20 to 60 seconds after the map is entered; with the lowest random number it is 20 seconds.
  // The game time is advanced by hand, so the 20 seconds do not take 20 seconds.
  await signInAsAdmin(page, context);
  await enterGame(page, "?random=0.01");
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  expect((await gameState(page)).atmosphere.birds).toBe(0);
  await advanceUntil(page, async () => (await gameState(page)).atmosphere.birds >= 3, 40_000, 500);
  await page.screenshot({ path: testInfo.outputPath("game-birds.png") });
  // The flock leaves the view on the other side, and then there are none until the next one.
  await advanceUntil(page, async () => (await gameState(page)).atmosphere.birds === 0, 40_000, 500);
});

test("[GAME-35][MAP-20] the fountain of the garden plays its animation, and with reduced motion it stands on its first frame", async ({
  page,
  context,
}, testInfo) => {
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
  // With the lowest random number the first wave comes after 8 seconds, and the NPCs set off at once. The game time is
  // advanced by hand, so the waits of the figures do not depend on the machine.
  await signInAsAdmin(page, context);
  await enterGame(page, "?random=0.01");
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const npcs = async () => (await gameState(page)).npcs;
  const named = async (name: string) => (await npcs()).find((npc) => npc.name === name);

  // The church: the sexton stands where his point is, facing the player, and waves.
  expect(await gameState(page)).toMatchObject({ mapId: "kirche" });
  const sexton = await named("kuester");
  expect(sexton).toMatchObject({ figure: "herold", moving: false, tappable: true });
  expect(Math.abs((sexton?.x ?? 0) - 256)).toBeLessThanOrEqual(1);
  expect(Math.abs((sexton?.y ?? 0) - 176)).toBeLessThanOrEqual(1);
  await advanceUntil(page, async () => (await named("kuester"))?.waving === true, 20_000);
  await page.screenshot({ path: testInfo.outputPath("game-npc-wave.png") });
  // He stays where he is; the church has no other NPC.
  expect((await named("kuester"))?.moving).toBe(false);
  expect(await npcs()).toHaveLength(1);

  // The garden: the gardener has no action, so a tap on him is a tap on the ground; he walks his path of 120 pixels.
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("garten", "start"));
  // The new map's files load in real time; the scene starts with the frames played meanwhile.
  await advanceUntil(page, async () => (await gameState(page)).mapId === "garten", 120_000, 50);
  const start = await named("gaertner");
  expect(start).toMatchObject({ figure: "male-guest", tappable: false });
  // He starts at the first point of his path (he has already set off).
  expect(Math.abs((start?.x ?? 99) - 0)).toBeLessThanOrEqual(30);
  const xs: number[] = [];
  await advanceUntil(
    page,
    async () => {
      const gardener = await named("gaertner");
      if (gardener === undefined) throw new Error("the gardener is gone");
      xs.push(gardener.x);
      return !gardener.moving && gardener.x >= 115;
    },
    30_000,
  );
  // He walked there in small steps, not by jumping, and now waits at the end.
  expect(xs.some((x) => x > 5 && x < 115)).toBe(true);
  await advanceUntil(page, async () => (await named("gaertner"))?.moving === true, 15_000);
  await advanceUntil(page, async () => ((await named("gaertner"))?.x ?? 999) < 110, 15_000);
  await page.screenshot({ path: testInfo.outputPath("game-npc-walk.png") });
});

test("[GAME-38][GAME-36] a tap on the sexton walks the player to him, he waits and glows meanwhile, and the programme opens; he has no sparkles", async ({
  page,
  context,
}, testInfo) => {
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

/** Opens the tab Objekte & Portale of Erlebniswelt on the map of the church. */
async function openObjects(page: Page): Promise<void> {
  await page.goto("/admin/world");
  await page.getByRole("button", { name: de.admin.world.tabObjects }).click();
  await page.getByRole("button", { name: "Kirche" }).click();
}

test("[MAP-21][CNT-09][GAME-37] the admin makes a dialogue with a greeting for the sexton and assigns it; in the game his speech bubble opens with the figure name and the greeting, he stops and turns to the player, and a tap on the bubble opens the dialogue", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page, context);
  // The dialogue, in the admin area: the figure's name, the greeting and a line. The id is made from the name.
  await page.goto("/admin/world");
  await page.getByRole("button", { name: de.admin.world.tabDialogues }).click();
  await page.getByRole("button", { name: de.admin.dialogues.add }).click();
  await page.getByLabel(de.admin.dialogues.npcName).fill("Küster Fritz");
  await page.getByLabel(/^Begrüssung/).fill("Psst, hier entlang zum Programm!");
  await page.getByLabel("Zeile 1", { exact: true }).fill("Willkommen in der Kirche!");
  await page.getByRole("button", { name: de.admin.dialogues.save }).click();
  await expect(page.getByText(de.admin.dialogues.saved)).toBeVisible();
  await expect(page.getByLabel(de.admin.dialogues.id)).toHaveValue("kuester-fritz");
  // The sexton is an NPC, configured like an object: the action of his row is the dialogue.
  await openObjects(page);
  await page
    .getByRole("combobox", { name: "Aktion von Küster" })
    .selectOption("dialog:kuester-fritz");
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();

  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  expect((await gameState(page)).mapId).toBe("kirche");
  // The player starts near him: his bubble opens with the dialogue's figure name and its greeting, and he stands still.
  // The game time is advanced by hand: the walks and waits of the figures do not depend on the speed of the machine.
  const bubble = page.locator('[data-testid="guest-bubble"][data-guest="npc:kuester"]');
  await advanceUntil(page, () => bubble.isVisible(), 10_000);
  // A greeting bubble holds the greeting only (no portrait, no name). While it is open it takes the place of the
  // label of its figure, which comes back when it closes (GAME-37, story 6.1d).
  await expect(bubble).toHaveText("Psst, hier entlang zum Programm!");
  await expect(bubble).toHaveAttribute("aria-label", "Küster Fritz");
  await expect(bubble.locator("img")).toHaveCount(0);
  await expect(page.locator('[data-testid="object-label"][data-label="npc:kuester"]')).toHaveCount(
    0,
  );
  const sexton = async () => (await gameState(page)).npcs.find((npc) => npc.name === "kuester");
  expect(await sexton()).toMatchObject({ bubble: true, moving: false, tappable: true });
  await page.screenshot({ path: testInfo.outputPath("game-npc-bubble.png") });
  // The gardener has no dialogue, so he has no bubble.
  await expect(page.locator('[data-testid="guest-bubble"][data-guest="npc:gaertner"]')).toHaveCount(
    0,
  );

  // A tap on the bubble does what a tap on the NPC does: his action runs, here the dialogue box.
  const box = page.getByTestId("dialogue-box");
  await advanceUntil(
    page,
    async () => {
      if (await box.isVisible()) return true;
      // A second tap while the player is on the way would only start the walk again.
      if ((await gameState(page)).walk.marker !== null) return false;
      // Once his action has run, the game is paused and his bubble is hidden while the box loads its lines: there is
      // nothing to tap then (a click would wait for a bubble that does not come back until the box is closed).
      if (!(await bubble.isVisible())) return false;
      await bubble.click({ timeout: 5_000 });
      return false;
    },
    40_000,
  );
  await expect(box).toContainText("Küster Fritz");
  await expect(box).toContainText("Willkommen in der Kirche!");
  // The bubbles are hidden while the dialogue is open above the game (GAME-11).
  await expect(bubble).toBeHidden();

  // Back to the preset of Tiled, which is a page: no dialogue, no bubble.
  await openObjects(page);
  await page.getByRole("combobox", { name: "Aktion von Küster" }).selectOption("page:programme");
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await gameState(page)).npcs.length).toBeGreaterThan(0);
  await expect(bubble).toHaveCount(0);
});

test("[GAME-39][GAME-37][GAME-40] an NPC outside the view has an indicator named by the figure name of its dialogue; a tap on it walks to him and opens the dialogue; without a greeting he has no bubble", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page, context);
  const id = await ensureDialogue(page, "Küster Fritz", "");
  await assignAction(page, "kirche", "kuester", { kind: "dialog", dialogId: id });
  // A phone-sized view shows only a small part of the map, so the sexton lies outside it.
  await page.setViewportSize({ width: 320, height: 520 });
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const indicator = page.locator('[data-indicator="npc:kuester"]');
  await expect(indicator).toBeVisible({ timeout: 10_000 });
  await expect(indicator).toContainText("Küster Fritz");
  // His dialogue has no greeting, so no bubble opens even if the player is near him.
  await expect(page.locator('[data-testid="guest-bubble"][data-guest="npc:kuester"]')).toHaveCount(
    0,
  );
  // The gardener stands in the garden, not on this map.
  await expect(page.locator('[data-indicator="npc:gaertner"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("game-npc-indicator.png") });
  await indicator.click();
  const box = page.getByTestId("dialogue-box");
  // The walk to him takes game time, which is advanced by hand.
  await advanceUntil(page, () => box.isVisible(), 40_000);
  await expect(box).toContainText("Küster Fritz");
  // The dialogue is open above the paused game: no indicator over it (GAME-11).
  await expect(indicator).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("[GAME-37][CNT-09] an object and an NPC with a greeting show it in a speech bubble; only the nearest one's bubble is open, and a greeting bubble holds the greeting only, above the label", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signInAsAdmin(page, context);
  const wirt = await ensureDialogue(page, "Wirt", "Prost!");
  const fritz = await ensureDialogue(page, "Küster Fritz", "Psst, hier entlang!");
  await assignAction(page, "kirche", "altar", { kind: "dialog", dialogId: wirt });
  await assignAction(page, "kirche", "kuester", { kind: "dialog", dialogId: fritz });
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const bubbles = page.getByTestId("guest-bubble");
  const sextonBubble = page.locator('[data-testid="guest-bubble"][data-guest="npc:kuester"]');
  const altarBubble = page.locator('[data-testid="guest-bubble"][data-guest="object:altar"]');

  // Where both are in range, the nearer one's bubble is the only one open; the sexton is the nearer one here.
  await advanceUntil(page, () => sextonBubble.isVisible(), 10_000);
  await expect(bubbles).toHaveCount(1);
  await expect(sextonBubble).toHaveText("Psst, hier entlang!");
  await expect(sextonBubble).toHaveAttribute("data-compact", "true");
  await expect(sextonBubble.locator("img")).toHaveCount(0);
  // It is as small as its text: narrower than the bubble of a guest (214 pixels).
  const box = await sextonBubble.boundingBox();
  expect(box?.width).toBeLessThan(180);
  // While his greeting bubble is open, his label is hidden: the bubble takes its place (GAME-41).
  const label = page.locator('[data-testid="object-label"][data-label="npc:kuester"]');
  await expect(label).toHaveCount(0);

  // Walking to the altar makes it the nearest: its bubble takes over, and again there is one only.
  const target = await pagePoint(page, { x: 128, y: 112 });
  await page.mouse.click(target.x, target.y);
  await advanceUntil(page, () => altarBubble.isVisible(), 30_000);
  await expect(bubbles).toHaveCount(1);
  await expect(altarBubble).toHaveText("Prost!");
  await expect(sextonBubble).toHaveCount(0);

  // A tap on the greeting of an object does what a tap on the object does: its dialogue opens.
  const dialogue = page.getByTestId("dialogue-box");
  await advanceUntil(
    page,
    async () => {
      if (await dialogue.isVisible()) return true;
      if (!(await altarBubble.isVisible())) return false;
      await altarBubble.click({ timeout: 5_000 });
      return false;
    },
    30_000,
  );
  await expect(dialogue).toContainText("Wirt");
});

test("[GAME-26][GAME-41] a long name is not cut off: the label of an object in sight stays on one line when the view allows, the label of an edge indicator wraps", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page, context);
  // The sexton's indicator is off, so that it cannot hide the altar's on the phone-sized view (GAME-41).
  await setIndicator(page, "kuester", false);
  const id = await ensureDialogue(page, LONG_NAME, "");
  await assignAction(page, "kirche", "altar", { kind: "dialog", dialogId: id });
  /** Whether the text of an element shows whole: nothing is cut off by the box, its lines are all visible. */
  const showsWhole = (locator: Locator) =>
    locator.evaluate((element) => ({
      whole:
        element.scrollHeight <= element.clientHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1,
      height: element.clientHeight,
      width: element.clientWidth,
    }));

  // In sight, on a desktop view: the name fits on one line, a pill wider than 160 pixels (GAME-41, story 6.1f).
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const label = page.locator('[data-testid="object-label"][data-label="object:altar"]');
  await expect(label).toHaveText(LONG_NAME, { timeout: 10_000 });
  const inSight = await showsWhole(label);
  expect(inSight.whole).toBe(true);
  expect(inSight.height).toBeLessThan(30);
  expect(inSight.width).toBeGreaterThan(160);

  // Out of sight, on a phone-sized view: the label of its edge indicator, whole as well.
  await page.setViewportSize({ width: 360, height: 420 });
  const indicator = page.locator('[data-indicator="object:altar"]');
  await expect(indicator).toBeVisible({ timeout: 10_000 });
  await expect(indicator).toContainText(LONG_NAME);
  const onEdge = await showsWhole(indicator.locator("span").last());
  expect(onEdge.whole).toBe(true);
  expect(onEdge.height > 22 || onEdge.width > 160).toBe(true);
});

test("[GAME-41][GAME-40] an object, portal or NPC in sight carries its label, named by the title of what it opens, whatever else it is, unless the admin turned showIndicator off", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  const label = (id: string) => page.locator(`[data-testid="object-label"][data-label="${id}"]`);
  // The altar and the sexton are in sight: their labels stand on top of them, their indicators are gone.
  await expect(label("object:altar")).toBeVisible({ timeout: 10_000 });
  await expect(label("object:altar")).toHaveText("Programm");
  // The sexton opens the programme, so he is named by the page's title, not by his label in Tiled (GAME-40).
  await expect(label("npc:kuester")).toHaveText("Programm");
  await expect(page.locator('[data-indicator="object:altar"]')).toHaveCount(0);
  // The labels are white pills with black text, and taps go through them.
  const style = await label("object:altar").evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      color: computed.color,
      background: computed.backgroundColor,
      events: computed.pointerEvents,
    };
  });
  expect(style).toEqual({
    color: "rgb(0, 0, 0)",
    background: "rgb(255, 255, 255)",
    events: "none",
  });
  await page.screenshot({ path: testInfo.outputPath("game-labels.png") });

  // The label names what the object opens: the programme's label is the page's title, not the Tiled label.
  await openObjects(page);
  await page.getByRole("combobox", { name: "Aktion von Programm" }).selectOption("page:profile");
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();
  await enterGame(page);
  await expect(label("object:altar")).toHaveText(de.nav.profile, { timeout: 10_000 });
  await openObjects(page);
  await page.getByRole("combobox", { name: "Aktion von Programm" }).selectOption("page:programme");
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();
  // An object that shows a dialogue is named by the dialogue's figure name (GAME-40, CNT-09).
  const wirt = await ensureDialogue(page, "Wirt", "Prost!");
  await assignAction(page, "kirche", "altar", { kind: "dialog", dialogId: wirt });
  await enterGame(page);
  await expect(label("object:altar")).toHaveText("Wirt", { timeout: 10_000 });
  await assignAction(page, "kirche", "altar", null);

  // The admin turns the indicator and label of the altar and of the sexton off, for surprises and side notes.
  await openObjects(page);
  await page.getByRole("checkbox", { name: "Randhinweis und Label von Programm zeigen" }).click();
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();
  await page.getByRole("checkbox", { name: "Randhinweis und Label von Küster zeigen" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Randhinweis und Label von Programm zeigen" }),
  ).not.toBeChecked();
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await gameState(page)).npcs.length).toBeGreaterThan(0);
  await expect(label("object:altar")).toHaveCount(0);
  await expect(label("npc:kuester")).toHaveCount(0);
  // Out of sight they have no indicator either.
  await page.setViewportSize({ width: 320, height: 520 });
  await expect(page.locator('[data-indicator="npc:kuester"]')).toHaveCount(0);
  await expect(page.locator('[data-indicator="object:altar"]')).toHaveCount(0);

  // Back on, as the other tests expect.
  await page.setViewportSize({ width: 1280, height: 720 });
  await openObjects(page);
  await page.getByRole("checkbox", { name: "Randhinweis und Label von Programm zeigen" }).click();
  await expect(page.getByText(de.admin.world.objects.saved)).toBeVisible();
  await page.getByRole("checkbox", { name: "Randhinweis und Label von Küster zeigen" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Randhinweis und Label von Küster zeigen" }),
  ).toBeChecked();

  // The gardener has no action, yet only showIndicator decides: his label follows him in the garden.
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.__zappaloo?.game?.selectSpawn("garten", "start"));
  await page.waitForFunction(() => window.__zappaloo?.game?.state()?.mapId === "garten");
  await expect(label("npc:gaertner")).toHaveText("gaertner", { timeout: 10_000 });
});

test("[GAME-42] the player shows as a silhouette while an object in front covers them, and not in the open", async ({
  page,
  context,
}, testInfo) => {
  await signInAsAdmin(page, context);
  await enterGame(page);
  await expect(page.getByTestId("game-canvas")).toBeVisible({ timeout: 20_000 });
  // At the start point, in front of everything: no silhouette.
  expect((await gameState(page)).silhouettes).toEqual({ player: false, figures: 0, marker: false });

  // The walk to the top of the church leads past the altar, whose picture covers the figure behind it.
  const target = await pagePoint(page, { x: 160, y: 30 });
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(async () => (await gameState(page)).silhouettes.player, {
      timeout: 20_000,
      intervals: [50],
    })
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("game-silhouette.png") });

  // Back in the open, in front of the objects, it is gone again.
  const back = await pagePoint(page, { x: 160, y: 200 });
  await page.mouse.click(back.x, back.y);
  await expect
    .poll(async () => (await gameState(page)).silhouettes.player, {
      timeout: 30_000,
      intervals: [100],
    })
    .toBe(false);
});
