import { expect, test } from "@playwright/test";
import { clientAddress, createAdmin, PASSWORD } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

// The installation on port 4174 starts empty (playwright.config.ts) and is set up once, so this
// test runs in one project only.
test.use({ baseURL: "http://localhost:4174" });

test("[CFG-02][CFG-06] a fresh installation: the operator creates the admin, the admin sets the event up and can change it later", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "the installation is set up only once");
  await context.setExtraHTTPHeaders({ "x-forwarded-for": clientAddress() });

  // The operator's part: the first admin, with a setup link.
  const token = createAdmin("lea", ".e2e-data-fresh").split("/").pop() ?? "";
  expect(
    (await page.request.post("/api/password/set", { data: { token, newPassword: PASSWORD } })).ok(),
  ).toBe(true);

  // Signing in leads to the setup form, nothing else is reachable.
  await page.goto("/login");
  await page.getByLabel(de.login.username).fill("lea");
  await page.getByLabel(de.login.password).fill(PASSWORD);
  await page.getByRole("button", { name: de.login.submit }).click();
  await expect(page.getByRole("heading", { name: de.admin.setup.title })).toBeVisible();
  await expect(page.getByRole("navigation", { name: de.admin.title })).toHaveCount(0);

  // Name, time zone and language are set once; then the admin area opens.
  await page.getByLabel(de.admin.identity.name).fill("Anna & Ben");
  await page.getByLabel(de.admin.identity.timezone).fill("Europe/Berlin");
  await page.getByRole("button", { name: de.admin.setup.submit }).click();
  await expect(page.getByRole("heading", { name: de.admin.home.title })).toBeVisible();
  const event: unknown = await (await page.request.get("/api/event")).json();
  expect(event).toMatchObject({
    id: "event1",
    name: "Anna & Ben",
    timezone: "Europe/Berlin",
    defaultLanguage: "de",
    setupComplete: true,
  });

  // Changing it later, in Einstellungen.
  await page
    .getByRole("navigation", { name: de.admin.title })
    .getByRole("link", { name: de.admin.nav.settings })
    .click();
  await page.getByLabel(de.admin.identity.name).fill("Anna und Ben");
  await page.getByRole("button", { name: de.admin.identity.save }).click();
  await expect(page.getByText(de.admin.identity.saved)).toBeVisible();
  expect(await (await page.request.get("/api/event")).json()).toMatchObject({
    name: "Anna und Ben",
  });
});
