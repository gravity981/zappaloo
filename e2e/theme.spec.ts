// The example theme package end to end (THM-01 – THM-05; sw-architecture.md 19.7): an admin imports
// it in Einstellungen, the website carries its colours, and the admin returns to the default theme.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support.ts";
import {
  buildExample,
  EXAMPLE_COLORS,
  EXAMPLE_FILE,
  EXAMPLE_NAME,
} from "../scripts/build-example-theme.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[THM-01][THM-04][THM-05] an admin imports the example theme, the website shows it, and the default returns with a second click", async ({
  page,
  context,
}, testInfo) => {
  // The theme is one setting of the installation: one profile only (as the other shared settings).
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  const card = page.locator('section[aria-labelledby="theme-title"]');
  await expect(card.getByText(de.admin.theme.standardInfo)).toBeVisible();

  // The package goes up as a whole; the card names it.
  // The package is written where the test keeps its files, so no build output is needed.
  mkdirSync(testInfo.outputDir, { recursive: true });
  const archive = join(testInfo.outputDir, EXAMPLE_FILE);
  writeFileSync(archive, buildExample());
  await card.locator('input[type="file"]').setInputFiles(archive);
  await expect(card.getByText(de.admin.theme.imported)).toBeVisible();
  await expect(card.getByText(`Aktiv: ${EXAMPLE_NAME}`)).toBeVisible();

  // The pages without sign-in carry the colours: the site answers with them, and the
  // website's frame sets them.
  const site = (await (await page.request.get("/api/site")).json()) as {
    theme: { colors: Record<string, string> } | null;
  };
  expect(site.theme?.colors).toEqual(EXAMPLE_COLORS);
  await page.goto("/mehr");
  await expect(page.locator(".themed")).toHaveAttribute(
    "style",
    new RegExp(`--a-dark: ${EXAMPLE_COLORS.accent}`),
  );

  // Back to the default: the first click only asks, the second one removes the package.
  await page.goto("/admin/settings");
  await card.getByRole("button", { name: de.admin.theme.resetButton }).click();
  await expect(
    card.getByRole("button", { name: de.admin.theme.resetButton, exact: true }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: de.admin.theme.resetConfirm }).click();
  await expect(card.getByText(de.admin.theme.standardInfo)).toBeVisible();
  const back = (await (await page.request.get("/api/site")).json()) as { theme: unknown };
  expect(back.theme).toBeNull();
  await page.goto("/mehr");
  await expect(page.locator(".themed")).not.toHaveAttribute("style", /--a-dark/);
});
