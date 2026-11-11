import { expect, test } from "@playwright/test";
import { clientAddress, createAdmin, PASSWORD } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[ACC-14][ACC-01][ACC-04][ACC-05] set the password with the setup link, sign in, edit the profile, sign out", async ({
  page,
  context,
}) => {
  const username = `u${Math.random().toString(36).slice(2, 10)}`;
  const link = createAdmin(username);
  await context.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() });

  // The one-time link sets the password.
  await page.goto(link);
  await page.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await page.getByLabel(de.setPassword.repeat).fill(PASSWORD);
  await page.getByRole("button", { name: de.setPassword.submit }).click();
  await expect(page.getByRole("heading", { name: de.setPassword.doneTitle })).toBeVisible();

  // The link works once.
  await page.goto(link);
  await page.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await page.getByLabel(de.setPassword.repeat).fill(PASSWORD);
  await page.getByRole("button", { name: de.setPassword.submit }).click();
  await expect(page.getByRole("alert")).toHaveText(de.errors.invalid_link);

  // A wrong password is refused; the right one signs in.
  await page.goto("/login");
  await page.getByLabel(de.login.username).fill(username);
  await page.getByLabel(de.login.password).fill("wrong-password");
  await page.getByRole("button", { name: de.login.submit }).click();
  await expect(page.getByRole("alert")).toHaveText(de.errors.invalid_credentials);
  await page.getByLabel(de.login.password).fill(PASSWORD);
  await page.getByRole("button", { name: de.login.submit }).click();
  await expect(page.getByRole("link", { name: de.nav.profile })).toBeVisible();

  // The session cookie is not readable by scripts, and it is not sent along with cross-site POSTs.
  const cookie = (await context.cookies()).find((c) => c.name === "zappaloo_session");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("zappaloo_session");

  // The profile is editable, and the change survives a reload (it is on the server).
  await page.getByRole("link", { name: de.nav.profile }).click();
  await page.getByLabel(de.profile.displayName).fill("E2E Admin");
  await page.getByRole("button", { name: de.profile.save }).click();
  await expect(page.getByRole("status")).toHaveText(de.profile.saved);
  await page.reload();
  await expect(page.getByLabel(de.profile.displayName)).toHaveValue("E2E Admin");

  // Signing out ends the session: the profile is no longer reachable.
  await page.locator(".guest-site-head").getByRole("button", { name: de.nav.logout }).click();
  await expect(page.getByRole("heading", { name: de.login.title })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: de.login.title })).toBeVisible();
});

test("[SEC-01] the API refuses a state-changing request without the CSRF token and from another origin", async ({
  playwright,
  baseURL,
}) => {
  const request = await playwright.request.newContext({
    baseURL: baseURL ?? "",
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  const username = `u${Math.random().toString(36).slice(2, 10)}`;
  const link = createAdmin(username);
  const token = link.split("/").pop() ?? "";
  expect(
    (await request.post("/api/password/set", { data: { token, newPassword: PASSWORD } })).status(),
  ).toBe(204);

  const crossSite = await request.post("/api/session", {
    data: { username, password: PASSWORD },
    headers: { origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
  expect((await crossSite.json()) as unknown).toMatchObject({ error: { code: "csrf_failed" } });

  const session = await request.post("/api/session", {
    data: { username, password: PASSWORD },
    headers: { origin: baseURL ?? "" },
  });
  expect(session.status()).toBe(200);
  // Signed in (the request context keeps the cookie), but without the token.
  const withoutToken = await request.patch("/api/profile", { data: { displayName: "x" } });
  expect(withoutToken.status()).toBe(403);
});
