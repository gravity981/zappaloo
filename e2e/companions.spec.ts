import { expect, test } from "@playwright/test";
import { clientAddress, PASSWORD, signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

// The settings of the installation are shared by all tests, which run side by side: this test
// uses the defaults of 7.4.2 (one answer per person, accompanying persons without approval). The
// other settings are tested with the API and the pages (RSVP-11, RSVP-12).
test("[RSVP-08][RSVP-10][RSVP-12][SEC-11] a guest adds an accompanying person, who counts at once; the admin removes them", async ({
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

  // The admin keeps the RSVP open and invites a guest to the ceremony only.
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  await page.getByLabel(de.admin.rsvpSettings.deadline).fill("2099-12-31");
  await page.getByRole("button", { name: de.admin.rsvpSettings.saveDeadline }).click();
  await expect(
    page.getByRole("status").filter({ hasText: de.admin.rsvpSettings.saved }),
  ).toBeVisible();
  await page.goto("/admin/invitations");
  await page.getByLabel(de.admin.invitations.names).fill(guestName);
  const invitedTo = page.getByRole("group", { name: de.admin.invitations.programItems });
  for (const programItem of ["Apéro", "Dinner", "Party"]) {
    await invitedTo.getByRole("button", { name: programItem }).click();
  }
  await page.getByRole("button", { name: /Einladung erstellen/ }).click();
  const codeCell = page.locator(".invitation-code");
  await expect(codeCell).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeCell.textContent()) ?? "";

  // The guest redeems the invitation and answers for themselves.
  const guestContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${code}`);
  await guest.getByLabel(de.invite.username).fill(username);
  await guest.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await guest.getByRole("button", { name: de.invite.register }).click();
  await guest.getByRole("link", { name: de.waiting.answer }).click();
  await guest.getByRole("button", { name: de.rsvp.iCome, exact: true }).click();
  await guest.getByRole("button", { name: de.rsvp.next }).click();
  await guest.getByRole("button", { name: de.rsvp.next }).click();

  // Step 3: "hinzufügen", with the person's own answer; the person counts at once.
  await guest.getByRole("button", { name: new RegExp(de.rsvp.companions.new) }).click();
  await guest.getByLabel(de.rsvp.companions.name).fill(mia);
  await guest.getByLabel(de.rsvp.companions.note).fill("Meine Tochter, 6 Jahre");
  const add = guest.getByRole("button", { name: de.rsvp.companions.add });
  await expect(add).toBeDisabled();
  await guest
    .getByRole("button", { name: de.rsvp.personComes.replace("{{name}}", mia), exact: true })
    .click();
  await guest.getByLabel(new RegExp(`${de.rsvp.allergies} \\(${mia}\\)`)).fill("Erdnüsse");
  await add.click();
  const added = guest.getByRole("listitem").filter({ hasText: mia });
  await expect(added).toBeVisible();
  await expect(added.getByText(de.rsvp.companions.status.pending)).toHaveCount(0);
  await expect(
    added.getByRole("button", { name: `${de.rsvp.companions.remove}: ${mia}` }),
  ).toBeVisible();
  await guest.getByRole("button", { name: de.rsvp.send }).click();
  await expect(guest.getByText(mia)).toBeVisible();

  // The admin sees the person in the table under the guest, with the allergies (admins only);
  // there is no card with requests.
  await page.goto("/admin/rsvp");
  await expect(page.getByRole("region", { name: /Begleitpersonen-Anfragen/ })).toHaveCount(0);
  const row = page.getByRole("row", { name: new RegExp(mia) });
  await expect(row).toContainText("Trauung");
  await expect(row).toContainText("Erdnüsse");
  const csv = await page.request.get("/api/admin/rsvp/export");
  expect(await csv.text()).toContain(`↳ ${mia};bestätigt;ja;;;;;;Erdnüsse`);
  expect((await guest.request.get("/api/admin/rsvp")).status()).toBe(403);

  // The admin removes the person with a second click.
  await row.getByRole("button", { name: `${de.admin.rsvp.remove}: ${mia}` }).click();
  await row.getByRole("button", { name: de.admin.rsvp.removeFinal }).click();
  await expect(page.getByRole("row", { name: new RegExp(mia) })).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByText(mia)).toHaveCount(0);
  await guestContext.close();
});
