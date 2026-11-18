import { expect, test } from "./support.ts";
import { signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

test("[ROLE-07][ACC-08][ACC-20][ROLE-01][ROLE-06][GRP-01][CFG-05] an admin manages accounts, groups and features in the admin area", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  const suffix = Math.random().toString(36).slice(2, 8);
  const username = `gast${suffix}`;
  const name = `E2E Gast ${suffix}`;

  // From the website into the admin area.
  // The admin area is reached from "Mehr" (UX mock more).
  await page.goto("/mehr");
  await page.getByRole("link", { name: de.nav.admin }).click();
  await expect(page.getByRole("heading", { name: de.admin.home.title })).toBeVisible();
  const nav = page.getByRole("navigation", { name: de.admin.title });

  // A new account, with its setup link to hand over.
  await nav.getByRole("link", { name: de.admin.nav.users }).click();
  await page.getByRole("button", { name: de.admin.users.create }).click();
  const create = page.getByRole("dialog", { name: de.admin.users.createTitle });
  await create.getByLabel(de.admin.users.username).fill(username);
  await create.getByLabel(de.admin.users.displayName).fill(name);
  await create.getByRole("button", { name: de.admin.roles.vip }).click();
  // A new guest needs at least one program item (ACC-20).
  await expect(create.getByRole("button", { name: de.admin.users.createSubmit })).toBeDisabled();
  await create.getByRole("button", { name: "Trauung" }).click();
  await create.getByRole("button", { name: de.admin.users.createSubmit }).click();
  await expect(page.getByLabel(de.admin.users.setupLink)).toHaveValue(/\/set-password\/[\w-]+$/);
  await page.getByRole("button", { name: de.admin.invitations.done }).click();

  // The account is inactive until its owner uses the setup link.
  const row = page.getByRole("row", { name: new RegExp(username) });
  await expect(row).toContainText(de.admin.users.status.inactive);

  // Roles in the table: staff joins vip, vip stays.
  const staff = page.getByRole("button", { name: `staff für ${name}` });
  await staff.click();
  await expect(staff).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: `vip für ${name}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Capabilities of the staff member, in the account panel.
  await page.getByRole("button", { name: `Konto ${name} bearbeiten` }).click();
  const panel = page.getByRole("dialog", { name });
  const moderation = panel.getByRole("button", {
    name: de.admin.capabilities.moderateContributions,
  });
  await moderation.click();
  await expect(moderation).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button", { name: de.admin.close }).click();

  // A guest group with the new account as its member.
  const group = `Gruppe ${suffix}`;
  await page.getByRole("button", { name: de.admin.groups.new }).click();
  await page.getByLabel(de.admin.groups.name).fill(group);
  await page.getByRole("button", { name: de.admin.groups.add }).click();
  await page.getByRole("button", { name: new RegExp(group) }).click();
  const groupPanel = page.getByRole("dialog", { name: group });
  await groupPanel
    .getByLabel(de.admin.groups.addMember)
    .selectOption({ label: `${name} (${username})` });
  await groupPanel.getByRole("button", { name: de.admin.groups.add }).click();
  await expect(groupPanel.getByText(name)).toBeVisible();
  await groupPanel.getByRole("button", { name: de.admin.groups.delete }).click();
  await groupPanel.getByRole("button", { name: de.admin.groups.deleteFinal }).click();
  await expect(page.getByRole("button", { name: new RegExp(group) })).toBeHidden();

  // A feature switch applies at once and survives a reload (it is on the server).
  await nav.getByRole("link", { name: de.admin.nav.settings }).click();
  const hunt = page.getByRole("switch", { name: de.admin.features.treasureHunt });
  const before = await hunt.getAttribute("aria-checked");
  const after = before === "true" ? "false" : "true";
  await hunt.click();
  await expect(hunt).toHaveAttribute("aria-checked", after);
  await page.reload();
  await expect(hunt).toHaveAttribute("aria-checked", after);
  await hunt.click();
  await expect(hunt).toHaveAttribute("aria-checked", before ?? "");
});

test("[CFG-03][ACS-11] Einstellungen puts the rarely changed cards last: design, waiting page texts, privacy notice and footer", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page, context);
  await page.goto("/admin/settings");
  const titles = [
    de.admin.identity.title,
    de.admin.waiting.openingTitle,
    de.admin.rsvpSettings.title,
    de.admin.settings.features,
    de.admin.theme.title,
    de.admin.waiting.textsTitle,
    de.admin.privacy.title,
    de.admin.footer.title,
  ];
  const tops: number[] = [];
  for (const title of titles) {
    const box = await page
      .locator("section.card")
      .filter({ has: page.getByText(title, { exact: true }) })
      .first()
      .boundingBox();
    expect(box, title).not.toBeNull();
    tops.push(box?.y ?? 0);
  }
  // Wide screens put the RSVP card and the features side by side: they share a row, and every
  // card after them lies below both.
  const [, opening, rsvp, features, ...last] = tops as [
    number,
    number,
    number,
    number,
    ...number[],
  ];
  expect(opening).toBeGreaterThan(tops[0] ?? 0);
  expect(rsvp).toBeGreaterThan(opening);
  for (const top of last) expect(top).toBeGreaterThan(Math.max(rsvp, features));
  expect([...last].sort((a, b) => a - b)).toEqual(last);
});
