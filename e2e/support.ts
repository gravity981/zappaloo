// Helpers shared by the end-to-end tests.
import { execFileSync } from "node:child_process";
import { test as base } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

/** Presses a hold button (the confirmation of a risky action) for its four seconds, with the mouse. */
export async function holdButton(page: Page, button: Locator): Promise<void> {
  const box = await button.boundingBox();
  if (!box) throw new Error("the hold button is not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(4300);
  await page.mouse.up();
}

/** A client address of its own for a test: the rate limits count per address. */
export function clientAddress(): string {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${String(part())}.${String(part())}.${String(part())}`;
}

/**
 * Creates an admin with the CLI, as the operator would, and returns the path of its setup link.
 * `dataDir` is the installation's: the main test installation by default.
 */
export function createAdmin(username: string, dataDir = ".e2e-data"): string {
  const output = execFileSync(process.execPath, ["backend/src/cli.ts", "create-admin", username], {
    encoding: "utf8",
    env: { ...process.env, DATA_DIR: dataDir, APP_ENV: "test" },
  });
  const link = /^http\S*(\/set-password\/[\w-]+)$/m.exec(output)?.[1];
  if (!link) throw new Error(`no setup link in the output of create-admin:\n${output}`);
  return link;
}

/**
 * Signs in a fresh admin in this browser context (the platform needs a session, ACS-09):
 * the setup link sets the password, the sign-in sets the session cookie.
 */
export async function signInAsAdmin(page: Page, context: BrowserContext): Promise<string> {
  const username = `u${Math.random().toString(36).slice(2, 10)}`;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() });
  const token = createAdmin(username).split("/").pop() ?? "";
  const set = await page.request.post("/api/password/set", {
    data: { token, newPassword: PASSWORD },
  });
  if (!set.ok()) throw new Error(`setting the password failed: ${await set.text()}`);
  const login = await page.request.post("/api/session", {
    data: { username, password: PASSWORD },
  });
  if (!login.ok()) throw new Error(`signing in failed: ${await login.text()}`);
  return username;
}

/** Chooses the first figure the signed-in user may choose, so that the game opens without the first-entry avatar step. */
export async function chooseFirstFigure(page: Page): Promise<void> {
  const session = (await (await page.request.get("/api/session")).json()) as { csrfToken: string };
  const avatar = (await (await page.request.get("/api/avatar")).json()) as {
    persons: { figures: { id: string }[] }[];
  };
  const figure = avatar.persons[0]?.figures[0]?.id;
  if (figure === undefined) throw new Error("the world has no figure for this user");
  const put = await page.request.put("/api/avatar/me", {
    headers: { "x-csrf-token": session.csrfToken },
    data: { figure },
  });
  if (!put.ok()) throw new Error(`choosing a figure failed: ${await put.text()}`);
}

/**
 * Keeps a browser context on the website: with an active world, `/` lands in the game once per browser session
 * (GAME-12), and the world tests import a world on the shared installation. The flag is the one the app sets when
 * the player goes to the website.
 */
export async function stayOnWebsite(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem("zappaloo.game.website", "1");
    } catch {
      // A page without session storage is not redirected either way.
    }
  });
}

/** `test` for the specs of the website and the admin area: their contexts stay on the website (see `stayOnWebsite`). */
export const test = base.extend({
  context: async ({ context }, use) => {
    await stayOnWebsite(context);
    await use(context);
  },
});
export { expect } from "@playwright/test";
