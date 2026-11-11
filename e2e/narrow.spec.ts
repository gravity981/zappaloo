import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support.ts";

/**
 * Step 3g: on a phone nothing of the guest pages is cut off. A page that is wider than the
 * screen scrolls sideways, so its content does not fit.
 */
const PUBLIC_PAGES = [
  "/login",
  "/invite",
  "/invite/ABC234",
  "/forgot-password",
  "/datenschutz",
  "/set-password/ungueltig",
  "/verify-email/ungueltig",
  "/gibt-es-nicht",
];

async function overflow(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test("[ACC-01][ACC-03][INV-03][SEC-09] the pages before the sign-in fit the width of a phone", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "phones only");
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Datenschutz" }).first()).toBeVisible();
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

test("[ACC-04][SEC-09] the profile fits the width of a phone", async ({
  page,
  context,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "phones only");
  await signInAsAdmin(page, context);
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: "Datenschutz" }).first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
