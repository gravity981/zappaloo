import { expect, test } from "@playwright/test";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[SEC-09][SEC-11] the privacy notice is readable without signing in and linked from the login page", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: de.footer.privacy }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(page.getByRole("heading", { name: "Datenschutz", level: 1 })).toBeVisible();
  // The health data of the RSVP are named, and who sees them.
  await expect(page.getByText(/Gesundheitsdaten/)).toBeVisible();
  await expect(page.getByText(/Nur die Administratoren sehen sie/)).toBeVisible();
  await expect(page.getByText(/Fest «Event Muster»/)).toBeVisible();
  // The API answers without a session, too, and the page does not run scripts from its text.
  expect((await page.request.get("/api/privacy")).ok()).toBe(true);
});
