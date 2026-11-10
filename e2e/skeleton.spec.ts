import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

const NOINDEX = /noindex/;

test("[SEC-10] robots.txt disallows all crawlers", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
});

test("[SEC-10] pages, scripts and API responses carry X-Robots-Tag noindex", async ({ page }) => {
  const responses: { url: string; header: string | null }[] = [];
  page.on("response", (response) => {
    responses.push({ url: response.url(), header: response.headers()["x-robots-tag"] ?? null });
  });

  const home = await page.goto("/");
  expect(home?.headers()["x-robots-tag"]).toMatch(NOINDEX);
  await page.goto("/a/client/route");
  const api = await page.request.get("/api/health");
  expect(api.headers()["x-robots-tag"]).toMatch(NOINDEX);

  expect(responses.some((r) => r.url.endsWith(".js"))).toBe(true);
  for (const response of responses) {
    expect(response.header, response.url).toMatch(NOINDEX);
  }
});

test("[LANG-01] the website shows its texts in German", async ({ page, context }) => {
  await signInAsAdmin(page, context);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(de.home.title);
  await expect(page.getByText(de.home.placeholder)).toBeVisible();
});

test("Phaser mounts with an empty scene", async ({ page, context }) => {
  await signInAsAdmin(page, context);
  await page.goto("/");
  await page.getByRole("link", { name: de.nav.game }).click();
  await expect(page.locator("[data-testid=game-canvas] canvas")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__zappaloo?.game?.activeScenes() ?? []))
    .toEqual(["empty"]);
});

test("the backend reports health and version", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });
  const version = (await (await request.get("/api/version")).json()) as { version: string };
  expect(version.version).toMatch(/\+dev$/);
});

test("[CFG-02][CFG-05] the server started with the example event and serves it with its toggles", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  const response = await page.request.get("/api/event");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: "event-muster",
    name: "Event Muster",
    features: { minigames: true, eventScreen: true },
    settings: { platformOpen: false },
  });
});

test("[ACS-09][ACS-07] without a session only the public pages and routes are reachable", async ({
  page,
  request,
}) => {
  // Pages: everything but login, password reset, verification and invitations goes to the login.
  for (const path of ["/", "/game", "/profile", "/some/unknown/page"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: de.login.title }), path).toBeVisible();
    expect(new URL(page.url()).pathname, path).toBe("/login");
  }
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: de.forgotPassword.title })).toBeVisible();
  await page.goto("/invite");
  await expect(page.getByRole("heading", { name: de.invite.title })).toBeVisible();

  // API: a protected route and an unknown one answer 401, the public ones work.
  for (const path of ["/api/event", "/api/profile", "/api/admin/users", "/api/nothing-here"]) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  for (const path of ["/api/health", "/api/version", "/api/session"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});
