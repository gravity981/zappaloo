import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

// The footer's notice is the event's, shared by all browser profiles: one profile edits it.
test("[LIC-01][LIC-02][LIC-03] the admin edits the copyright line; anyone sees it under the footer, and the license page shows the AGPL", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  const line = `© 2027 Testfest ${Math.random().toString(36).slice(2, 8)}`;

  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  const card = page.locator("section.card", { hasText: de.admin.footer.title });
  await card.getByLabel(de.admin.footer.label).fill(line);
  await card.getByRole("button", { name: de.admin.footer.save }).click();
  await expect(card.getByRole("status")).toHaveText(de.admin.footer.saved);

  // Somebody without a session sees the line, the license sentence and both links.
  const visitor = await browser.newContext(baseURL ? { baseURL } : {});
  const login = await visitor.newPage();
  await login.goto("/login");
  const footer = login.locator("footer.version-footer");
  await expect(footer.getByText(line)).toBeVisible();
  await expect(footer.getByText(de.legal.license)).toBeVisible();
  await expect(footer.getByRole("link", { name: de.legal.source })).toHaveAttribute(
    "href",
    /^https?:\/\//,
  );
  await footer.getByRole("link", { name: de.legal.licensePage }).click();
  await expect(login).toHaveURL(/\/license$/);
  await expect(login.getByText(/GNU AFFERO GENERAL PUBLIC LICENSE/).first()).toBeVisible();
  await visitor.close();

  // An empty line hides it; the default comes back with "Zurücksetzen".
  await card.getByLabel(de.admin.footer.label).fill("");
  await card.getByRole("button", { name: de.admin.footer.save }).click();
  await expect(card.getByRole("status")).toHaveText(de.admin.footer.saved);
  await page.goto("/login");
  await expect(page.locator("footer.version-footer").getByText(line)).toHaveCount(0);
  await expect(
    page.locator("footer.version-footer").getByRole("link", { name: de.legal.source }),
  ).toBeVisible();
  await page.goto("/admin/settings");
  await card.getByRole("button", { name: de.admin.footer.reset }).click();
  await expect(card.getByLabel(de.admin.footer.label)).toHaveValue(/^© \d{4} /);
});
