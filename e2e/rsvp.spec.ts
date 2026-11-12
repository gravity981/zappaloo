import { expect, test } from "@playwright/test";
import { clientAddress, PASSWORD, signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[RSVP-01][RSVP-02][RSVP-03][RSVP-04][RSVP-05][RSVP-06][SEC-11][DATA-05] a guest answers the RSVP for the invited program items; the admin sees it and changes it", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  // Two browsers, many steps, and the other browser profiles run at the same time.
  test.setTimeout(90_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  const name = `E2E Gast ${suffix}`;
  const username = `gast${suffix}`;

  // The admin opens the RSVP until far in the future (the example deadline is in 2027).
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  await page.getByLabel(de.admin.rsvpSettings.deadline).fill("2099-12-31");
  await page.getByRole("button", { name: de.admin.rsvpSettings.saveDeadline }).click();
  await expect(
    page.getByRole("status").filter({ hasText: de.admin.rsvpSettings.saved }),
  ).toBeVisible();
  // The example program items and menus of the seeded event are there, one program item has the meal.
  await expect(page.getByText(de.admin.rsvpSettings.mealTag, { exact: true })).toBeVisible();

  // An invitation for every program item except the party.
  await page.goto("/admin/invitations");
  await page.getByLabel(de.admin.invitations.names).fill(name);
  const invitedTo = page.getByRole("group", { name: de.admin.invitations.programItems });
  await invitedTo.getByRole("button", { name: "Party" }).click();
  await page.getByRole("button", { name: /Einladung erstellen/ }).click();
  const codeCell = page.locator(".invitation-code");
  await expect(codeCell).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeCell.textContent()) ?? "";

  // The guest redeems the invitation in a browser of their own and answers.
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

  await expect(
    guest.getByRole("heading", { name: de.rsvp.greeting.replace("{{name}}", name) }),
  ).toBeVisible();
  // Only the invited program items are offered.
  await expect(guest.getByRole("group", { name: "Party" })).toHaveCount(0);
  await guest.getByRole("button", { name: `Trauung: ${de.rsvp.attending}` }).click();
  await guest.getByRole("button", { name: `Apéro: ${de.rsvp.attending}` }).click();
  await guest.getByRole("button", { name: `Dinner: ${de.rsvp.attending}` }).click();
  await guest.getByRole("button", { name: de.rsvp.next }).click();

  // The menu is asked because the guest attends the meal program item, and it is required.
  await expect(guest.getByRole("button", { name: de.rsvp.next })).toBeDisabled();
  await guest.getByRole("button", { name: "Vegetarisch" }).click();
  await guest.getByLabel(de.rsvp.allergies).fill("Nüsse");
  await guest.getByRole("button", { name: de.rsvp.next }).click();
  await guest.getByLabel(de.rsvp.song).fill("ABBA – Dancing Queen");
  await guest.getByRole("button", { name: de.rsvp.send }).click();
  await expect(
    guest.getByRole("heading", { name: de.rsvp.done.replace("{{name}}", name) }),
  ).toBeVisible();

  // The answer is on the server: a reload shows the summary, not the wizard.
  await guest.reload();
  await expect(guest.getByText("ABBA – Dancing Queen")).toBeVisible();

  // The admin sees the answer with the allergies, and the guest counts as answered.
  await page.goto("/admin/rsvp");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Trauung, Apéro, Dinner");
  await expect(row).toContainText("Vegetarisch");
  await expect(row).toContainText("Nüsse");
  await expect(page.getByRole("link", { name: "CSV" })).toHaveAttribute(
    "href",
    "/api/admin/rsvp/export",
  );
  const csv = await page.request.get("/api/admin/rsvp/export");
  expect(await csv.text()).toContain(
    `${name};zugesagt;ja;ja;ja;;Vegetarisch;ABBA – Dancing Queen;Nüsse`,
  );

  // Allergies reach nobody but the admin: the guest has no access to the overview.
  expect((await guest.request.get("/api/admin/rsvp")).status()).toBe(403);

  // The admin changes the answer in admin mode; the guest sees the change.
  await row.getByRole("link", { name: `${de.admin.rsvp.edit}: ${name}` }).click();
  await expect(page.getByText(de.rsvp.adminMode)).toBeVisible();
  await page.getByRole("button", { name: de.rsvp.change }).click();
  await page.getByRole("button", { name: `Apéro: ${de.rsvp.notAttending}` }).click();
  await page.getByRole("button", { name: de.rsvp.next }).click();
  await page.getByRole("button", { name: de.rsvp.next }).click();
  await page.getByRole("button", { name: de.rsvp.send }).click();
  await expect(page.getByRole("button", { name: de.rsvp.change })).toBeVisible();
  await guest.reload();
  await expect(guest.getByText("Trauung")).toBeVisible();
  await expect(
    guest.getByRole("listitem").filter({ hasText: "Apéro" }).getByText(de.rsvp.notAttending),
  ).toBeVisible();

  // The card "Zuletzt" tells about it.
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: de.admin.home.activity })).toContainText(
    /Rückmeldung|Admin-Modus/,
  );
  await guestContext.close();
});
