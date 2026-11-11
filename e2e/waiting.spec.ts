import { expect, test } from "@playwright/test";
import { clientAddress, PASSWORD, signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

// The waiting-page settings are the event's, shared by all browser profiles: one profile runs
// this test, the others skip it.
test("[ACS-10][ACS-11][ACS-12][ACS-13] a guest of the closed platform sees the door scene and a text for their status, can answer the RSVP, and the countdown follows the admin's settings", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "shared settings: one profile only");
  test.setTimeout(90_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  const guestName = `Wartegast ${suffix}`;

  // The admin starts from the default texts and no countdown, and invites a guest.
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  await page.getByLabel(de.admin.rsvpSettings.deadline).fill("2099-12-31");
  await page.getByRole("button", { name: de.admin.rsvpSettings.saveDeadline }).click();
  await expect(
    page.getByRole("status").filter({ hasText: de.admin.rsvpSettings.saved }),
  ).toBeVisible();
  await page.goto("/admin/invitations");
  await page.getByLabel(de.admin.invitations.names).fill(guestName);
  await page.getByRole("button", { name: /Einladung erstellen/ }).click();
  const codeCell = page.locator(".invitation-code");
  await expect(codeCell).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeCell.textContent()) ?? "";

  // The guest redeems the invitation and lands on the waiting page, not on the website.
  const guestContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${code}`);
  await guest.getByLabel(de.invite.username).fill(`wg${suffix}`);
  await guest.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await guest.getByLabel(de.setPassword.repeat).fill(PASSWORD);
  await guest.getByRole("button", { name: de.invite.register }).click();
  await expect(guest.getByText(new RegExp(`Psst, ${guestName}`))).toBeVisible();
  await expect(guest.getByRole("img", { name: /angelehnte Tür/ })).toBeVisible();
  await expect(guest.getByRole("link", { name: de.nav.game })).toHaveCount(0);
  await expect(guest.getByRole("timer")).toHaveCount(0);
  // The door scene is drawn: the canvas is not blank.
  const painted = await guest.locator("canvas.door-scene").evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
    return new Set(Array.from({ length: 200 }, (_, i) => data[(i * 4001) % data.length])).size > 2;
  });
  expect(painted).toBe(true);
  await testInfo.attach("waiting-page", {
    body: await guest.screenshot(),
    contentType: "image/png",
  });

  // The game world is closed for the guest.
  await guest.goto("/game");
  await expect(guest.getByText(new RegExp(`Psst, ${guestName}`))).toBeVisible();

  // The guest answers the RSVP from the waiting page; the text changes with the status.
  await guest.getByRole("link", { name: de.waiting.answer }).click();
  for (const part of ["Trauung", "Apéro", "Dinner", "Party"]) {
    await guest.getByRole("button", { name: `${part}: ${de.rsvp.notAttending}` }).click();
  }
  await guest.getByRole("button", { name: de.rsvp.send }).click();
  await guest.goto("/");
  await expect(guest.getByText(/Schade, dass du nicht dabei sein kannst/)).toBeVisible();
  await expect(guest.getByRole("link", { name: de.waiting.change })).toBeVisible();

  // The admin edits the text for declined guests and announces an opening date with a countdown.
  await page.goto("/admin/settings");
  const declined = page.getByLabel(de.admin.waiting.texts.declined);
  await declined.fill(`Schade {name}! Es geht ab {openingDate} los. ${suffix}`);
  await page.getByRole("button", { name: de.admin.waiting.saveTexts }).click();
  await expect(page.getByRole("status").filter({ hasText: de.admin.waiting.saved })).toBeVisible();
  await page.getByLabel(/Angekündigtes Öffnungsdatum/).fill("2099-05-15T18:00");
  await page.getByRole("button", { name: de.admin.waiting.saveOpening }).click();
  await page.getByRole("switch", { name: de.admin.waiting.countdown }).click();
  await expect(page.getByRole("switch", { name: de.admin.waiting.countdown })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await guest.reload();
  await expect(guest.getByText(`Schade ${guestName}! Es geht ab 15. Mai 2099`)).toBeVisible();
  await expect(guest.getByRole("timer")).toBeVisible();

  // Back to the defaults, so the other tests see an unannounced platform.
  await page
    .getByRole("button", { name: `${de.admin.waiting.reset}: ${de.admin.waiting.texts.declined}` })
    .click();
  await page.getByRole("switch", { name: de.admin.waiting.countdown }).click();
  await expect(page.getByRole("switch", { name: de.admin.waiting.countdown })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await guestContext.close();
});
