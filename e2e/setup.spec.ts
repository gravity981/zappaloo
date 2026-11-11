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
  await page
    .getByRole("region", { name: de.admin.identity.title })
    .getByRole("button", { name: de.admin.identity.save })
    .click();
  await expect(page.getByText(de.admin.identity.saved, { exact: true })).toBeVisible();
  expect(await (await page.request.get("/api/event")).json()).toMatchObject({
    name: "Anna und Ben",
  });

  // The privacy notice (SEC-09): the default text names the event and the allergies; the admin
  // edits it, and everyone reads it without signing in.
  await page
    .getByLabel(de.admin.privacy.label)
    .fill("# Unser Datenschutz\n\nNichts wird weitergegeben.");
  const privacyCard = page.getByRole("region", { name: de.admin.privacy.title });
  await privacyCard.getByRole("button", { name: de.admin.privacy.save }).click();
  await expect(privacyCard.getByRole("status")).toHaveText(de.admin.privacy.saved);
  const visitor = await page.context().browser()?.newContext({ baseURL: "http://localhost:4174" });
  if (!visitor) throw new Error("no browser");
  const anonymous = await visitor.newPage();
  await anonymous.goto("/datenschutz");
  await expect(anonymous.getByRole("heading", { name: "Unser Datenschutz" })).toBeVisible();
  await expect(anonymous.getByText("Nichts wird weitergegeben.")).toBeVisible();
  await privacyCard.getByRole("button", { name: de.admin.privacy.reset }).click();
  await anonymous.reload();
  await expect(anonymous.getByText(/Fest «Anna und Ben»/)).toBeVisible();
  await expect(anonymous.getByText(/Gesundheitsdaten/)).toBeVisible();
  await visitor.close();

  const platformOpen = async () =>
    (
      (await (await page.request.get("/api/event")).json()) as {
        settings: { platformOpen: boolean };
      }
    ).settings.platformOpen;

  // Opening the platform: there is no guest to mail yet, so the email cannot be chosen. The
  // state shows at once, and the admin can close it again.
  const opening = page.getByRole("region", { name: de.admin.waiting.openingTitle });
  await expect(opening.getByRole("checkbox")).toBeDisabled();
  await opening.getByRole("button", { name: de.admin.waiting.openNow }).click();
  await expect(opening.getByText(de.admin.waiting.opened, { exact: true })).toBeVisible();
  await expect(page.locator(".admin-head .tag")).toHaveText(de.admin.platformOpen);
  expect(await platformOpen()).toBe(true);
  await opening.getByRole("button", { name: de.admin.waiting.closeAgain }).click();
  await expect(opening.getByText(de.admin.waiting.closed)).toBeVisible();
  expect(await platformOpen()).toBe(false);
});
