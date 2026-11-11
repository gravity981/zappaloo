import { expect, test } from "@playwright/test";
import { clientAddress, PASSWORD, signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[RSVP-08][RSVP-09][RSVP-10][SEC-11] a guest requests an accompanying person, changes it, the admin approves, and the person counts", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  // Two browsers, many steps, and the other browser profiles run at the same time.
  test.setTimeout(90_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  const guestName = `E2E Gast ${suffix}`;
  const mia = `Mia ${suffix}`;
  const username = `gast${suffix}`;

  // The admin keeps the RSVP open and invites a guest to every part.
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

  // The guest redeems the invitation and answers for themselves: Trauung only.
  const guestContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${code}`);
  await guest.getByLabel(de.invite.username).fill(username);
  await guest.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await guest.getByLabel(de.setPassword.repeat).fill(PASSWORD);
  await guest.getByRole("button", { name: de.invite.register }).click();
  await guest.getByRole("link", { name: de.nav.rsvp }).click();
  await guest.getByRole("button", { name: `Trauung: ${de.rsvp.attending}` }).click();
  for (const part of ["Apéro", "Dinner", "Party"]) {
    await guest.getByRole("button", { name: `${part}: ${de.rsvp.notAttending}` }).click();
  }
  await guest.getByRole("button", { name: de.rsvp.next }).click();
  await guest.getByRole("button", { name: de.rsvp.next }).click();

  // Step 3: a request with the person's own answer; then a change while it is pending.
  await guest.getByRole("button", { name: new RegExp(de.rsvp.companions.new) }).click();
  await guest.getByLabel(de.rsvp.companions.name).fill(mia);
  await guest.getByLabel(de.rsvp.companions.note).fill("Meine Tochter");
  await guest.getByRole("button", { name: `Trauung: ${de.rsvp.attending}` }).click();
  for (const part of ["Apéro", "Party"]) {
    await guest.getByRole("button", { name: `${part}: ${de.rsvp.notAttending}` }).click();
  }
  await guest.getByRole("button", { name: `Dinner: ${de.rsvp.attending}` }).click();
  // The meal part needs a menu; the request waits for it.
  const request = guest.getByRole("button", { name: de.rsvp.companions.request });
  await expect(request).toBeDisabled();
  await guest.getByRole("button", { name: `${mia}: Kindermenü` }).click();
  await guest.getByLabel(new RegExp(`${de.rsvp.allergies} \\(${mia}\\)`)).fill("Erdnüsse");
  await request.click();
  const pending = guest.getByRole("listitem").filter({ hasText: mia });
  await expect(pending.getByText(de.rsvp.companions.status.pending)).toBeVisible();
  await pending.getByRole("button", { name: `${de.rsvp.companions.edit}: ${mia}` }).click();
  await guest.getByLabel(de.rsvp.companions.note).fill("Meine Tochter, 6 Jahre");
  await guest.getByRole("button", { name: de.rsvp.companions.save }).click();
  await expect(guest.getByText("Meine Tochter, 6 Jahre")).toBeVisible();
  await guest.getByRole("button", { name: de.rsvp.send }).click();
  await expect(guest.getByText(de.rsvp.companions.status.pending)).toBeVisible();

  // The admin sees the request with its note and approves it.
  await page.goto("/admin/rsvp");
  const requests = page.getByRole("region", { name: /Begleitpersonen-Anfragen/ });
  await expect(requests).toContainText(mia);
  await expect(requests).toContainText("Meine Tochter, 6 Jahre");
  await requests.getByRole("button", { name: `${de.admin.rsvp.approve}: ${mia}` }).click();
  await expect(page.getByRole("button", { name: `${de.admin.rsvp.approve}: ${mia}` })).toHaveCount(
    0,
  );

  // The approved person is in the table under the guest, with the allergies (admins only).
  const row = page.getByRole("row", { name: new RegExp(mia) });
  await expect(row).toContainText("Trauung, Dinner");
  await expect(row).toContainText("Kindermenü");
  await expect(row).toContainText("Erdnüsse");
  const csv = await page.request.get("/api/admin/rsvp/export");
  expect(await csv.text()).toContain(`↳ ${mia};bestätigt;ja;nein;ja;nein;Kindermenü;;Erdnüsse`);

  // The guest sees the approval and can no longer withdraw; the allergies are not visible to
  // anyone else.
  await guest.reload();
  await expect(
    guest
      .getByRole("listitem")
      .filter({ hasText: mia })
      .getByText(de.rsvp.companions.status.approved),
  ).toBeVisible();
  expect((await guest.request.get("/api/admin/rsvp")).status()).toBe(403);
  await guestContext.close();
});
