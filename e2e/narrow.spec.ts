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

/** Step 3.9a: no admin page moves sideways on a swipe; wide tables scroll inside their own box. */
const ADMIN_PAGES = [
  "/admin",
  "/admin/invitations",
  "/admin/rsvp",
  "/admin/users",
  "/admin/settings",
  "/admin/gibt-es-nicht",
];

test("[RSVP-02][SEC-09] no admin page scrolls sideways on a phone", async ({
  page,
  context,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "phones only");
  await signInAsAdmin(page, context);
  // The answer of one guest in admin mode needs a guest: an invitation creates one.
  const session = (await (await page.request.get("/api/session")).json()) as { csrfToken: string };
  const created = await page.request.post("/api/admin/invitations", {
    headers: { "x-csrf-token": session.csrfToken },
    data: { guests: [{ name: "E2E Schmal" }] },
  });
  const { invitations } = (await created.json()) as { invitations: { userId: number }[] };
  const guestPage = `/admin/rsvp/guests/${String(invitations[0]?.userId)}`;
  for (const path of [...ADMIN_PAGES, guestPage]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Datenschutz" }).first()).toBeVisible();
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
    // Real guest lists are wide: a table wider than the screen scrolls inside its own box.
    await page.evaluate(() => {
      for (const table of document.querySelectorAll<HTMLElement>(".table")) {
        table.style.minWidth = "900px";
      }
    });
    expect(await overflow(page), `${path} with wide tables`).toBeLessThanOrEqual(0);
    // A swipe moves the page only if it can scroll sideways at all.
    await page.evaluate(() => {
      window.scrollTo(200, 0);
    });
    expect(await page.evaluate(() => window.scrollX), `${path} scrollX`).toBe(0);
  }
});
