import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { clientAddress, PASSWORD, signInAsAdmin } from "./support.ts";
import de from "../frontend/src/i18n/locales/de/common.json" with { type: "json" };

/** Creates one invitation in Einladungen and returns its code. */
async function invite(page: Page, name: string): Promise<string> {
  await page.goto("/admin/invitations");
  await page.getByLabel(de.admin.invitations.names).fill(name);
  await page.getByRole("button", { name: /Einladung erstellen/ }).click();
  const codeCell = page.locator(".invitation-code");
  await expect(codeCell).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeCell.textContent()) ?? "";
  await page.getByRole("button", { name: de.admin.invitations.done }).click();
  return code;
}

test("[ACC-18][ACC-19][INV-20][INV-21] an admin blocks, unblocks and deletes a guest, uninvites one who never registered and cleans up old codes", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  // "Aufräumen" deletes the old codes of the whole installation, so two profiles at once would
  // take each other's codes away.
  test.skip(testInfo.project.name !== "desktop-chromium", "shared invitations: one profile only");
  test.setTimeout(90_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  const registered = `E2E Aktiv ${suffix}`;
  const never = `E2E Offen ${suffix}`;
  const lost = `E2E Verloren ${suffix}`;
  const username = `aktiv${suffix}`;

  await signInAsAdmin(page, context);
  const code = await invite(page, registered);
  await invite(page, never);
  await invite(page, lost);

  // The first guest registers in a browser of their own.
  const guestContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/invite/${code}`);
  await guest.getByLabel(de.invite.username).fill(username);
  await guest.getByLabel(de.setPassword.password, { exact: true }).fill(PASSWORD);
  await guest.getByRole("button", { name: de.invite.register }).click();
  await expect(guest.getByRole("link", { name: de.waiting.answer })).toBeVisible();
  const signIn = () =>
    guestContext.request.post("/api/session", { data: { username, password: PASSWORD } });

  // Blocking needs a second click. The guest's session ends and the sign-in is refused (ACC-18).
  await page.goto("/admin/users");
  const row = page.getByRole("row", { name: new RegExp(username) });
  await expect(row).toContainText(de.admin.users.status.active);
  await page.getByRole("button", { name: `Konto ${registered} bearbeiten` }).click();
  const panel = page.getByRole("dialog", { name: registered });
  await panel.getByRole("button", { name: de.admin.users.block }).click();
  await panel.getByRole("button", { name: de.admin.users.blockFinal }).click();
  await expect(row).toContainText(de.admin.users.status.blocked);
  expect((await (await guestContext.request.get("/api/session")).json()) as unknown).toMatchObject({
    user: null,
  });
  expect((await signIn()).status()).toBe(401);

  // Unblocking: the old password works again.
  await panel.getByRole("button", { name: de.admin.users.unblock }).click();
  await expect(row).toContainText(de.admin.users.status.active);
  expect((await signIn()).ok()).toBe(true);

  // Deleting the account takes its invitation along (ACC-19).
  await panel.getByRole("button", { name: de.admin.users.delete }).click();
  await panel.getByRole("button", { name: de.admin.users.deleteFinal }).click();
  await expect(row).toBeHidden();
  expect((await signIn()).status()).toBe(401);
  await guestContext.close();

  // Revoking the card of a guest who never registered removes the guest, after a second click
  // (INV-20).
  await page.goto("/admin/invitations");
  await expect(page.getByRole("row", { name: new RegExp(registered) })).toHaveCount(0);
  const open = page.getByRole("row", { name: new RegExp(never) });
  await open.getByRole("button", { name: `${de.admin.invitations.revoke}: ${never}` }).click();
  await open.getByRole("button", { name: de.admin.invitations.revokeAndRemove }).click();
  await expect(open).toHaveCount(0);

  // A lost card gets a new code. The replaced one stays in the list until "Aufräumen" (INV-21).
  const lostRows = page.getByRole("row", { name: new RegExp(lost) });
  await lostRows.getByRole("button", { name: de.admin.invitations.regenerate }).click();
  await page.getByRole("button", { name: de.admin.invitations.done }).click();
  await expect(lostRows).toHaveCount(2);
  await page.getByRole("button", { name: /^Aufräumen \(\d+\)$/ }).click();
  await page.getByRole("button", { name: de.admin.invitations.cleanupFinal }).click();
  await expect(lostRows).toHaveCount(1);
  await expect(lostRows).toContainText(de.admin.invitations.statuses.active);

  // The guest who never registered is gone from the accounts too, the one with the new code stays.
  await page.goto("/admin/users");
  await expect(page.getByRole("row", { name: new RegExp(lost) })).toHaveCount(1);
  await expect(page.getByRole("row", { name: new RegExp(never) })).toHaveCount(0);
});

test("[ACC-07][INV-07] a signed-in account without vip adds an invitation to itself", async ({
  page,
  context,
}) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const guestName = `E2E Merge ${suffix}`;
  const username = await signInAsAdmin(page, context);
  const code = await invite(page, guestName);

  // The page names the invitation and the account, and offers to sign out instead.
  await page.goto(`/invite/${code}`);
  await expect(
    page.getByText(
      de.invite.mergeQuestion.replace("{{guest}}", guestName).replace("{{user}}", username),
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: de.invite.logout })).toBeVisible();
  await page.getByRole("button", { name: de.invite.redeem }).click();
  await expect(page.getByText(de.invite.mergeQuestion.split("«")[0] ?? "")).toBeHidden();

  // The account is the guest now: it has vip, the code is redeemed and no second account is left.
  await page.goto("/admin/users");
  await expect(page.getByRole("button", { name: `vip für ${username}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("row", { name: new RegExp(guestName) })).toHaveCount(0);
  await page.goto("/admin/invitations");
  await expect(page.getByRole("row", { name: new RegExp(guestName) })).toContainText(
    de.admin.invitations.statuses.redeemed,
  );
});
