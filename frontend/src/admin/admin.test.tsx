import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, renderAt, signedIn, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The event with the platform still closed, as before the opening. */
const closedEvent = { ...event, settings: { ...event.settings, platformOpen: false } };

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };

/** An account as `GET /api/admin/users` lists it. */
function account(changes: Record<string, unknown> = {}) {
  return {
    ...anna,
    status: "active",
    vipAssignment: "invitation_code",
    personType: "adult",
    groups: [],
    invitedProgramItemIds: [],
    ...changes,
  };
}

describe("admin area", () => {
  it("[ROLE-07] only admins get in; others are sent to the start page", async () => {
    fakeBackend({ "GET /api/session": () => signedIn });
    renderAt("/admin/users");
    expect(
      await screen.findByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Verwaltung" })).not.toBeInTheDocument();
  });

  it("[ROLE-07] an admin reaches the admin area from the website and sees its pages", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: closedEvent }),
    });
    renderAt("/");
    user.click(await screen.findByRole("link", { name: "Verwaltung" }));
    expect(await screen.findByRole("heading", { name: "Übersicht" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Verwaltung" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Übersicht",
      "Einladungen",
      "Rückmeldungen",
      "Konten & Rollen",
      "Inhalte",
      "Einstellungen",
    ]);
    expect(await screen.findByText("Plattform geschlossen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Website" })).toHaveAttribute("href", "/");
  });
});

describe("features and settings", () => {
  /** The event on the fake server; PATCH changes it like the real one. */
  function eventBackend() {
    let current = structuredClone(closedEvent);
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: current }),
      "PATCH /api/admin/event": () => {
        const body = calls.at(-1)?.body as {
          features?: Partial<typeof event.features>;
          settings?: Partial<typeof event.settings>;
        };
        current = {
          ...current,
          features: { ...current.features, ...body.features },
          settings: { ...current.settings, ...body.settings },
        };
        return { status: 200, body: current };
      },
    });
    return calls;
  }

  it("[CFG-05] the overview shows the platform state and switches the uploads", async () => {
    const calls = eventBackend();
    renderAt("/admin");
    expect(await screen.findByText("Geschlossen", { selector: "b" })).toBeInTheDocument();
    const snapshots = await screen.findByRole("switch", { name: "Schnappschüsse" });
    expect(snapshots).toHaveAttribute("aria-checked", "false");
    user.click(snapshots);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Schnappschüsse" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toMatchObject({
      path: "/api/admin/event",
      csrf: "csrf-1",
      body: { settings: { snapshotUploadsOpen: true } },
    });
  });

  it("[CFG-03][CFG-05] the settings page switches a feature, live for the whole app", async () => {
    const calls = eventBackend();
    renderAt("/admin/settings");
    const gallery = await screen.findByRole("switch", { name: "Galerie" });
    expect(gallery).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("switch")).toHaveLength(7);
    user.click(gallery);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Galerie" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      features: { gallery: false },
    });
  });

  it("[CFG-05] a refused change is reported and the switch stays", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "PATCH /api/admin/event": () => ({
        status: 403,
        body: { error: { code: "forbidden", message: "x" } },
      }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("switch", { name: "Galerie" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dafür hast du keine Berechtigung.");
    expect(screen.getByRole("switch", { name: "Galerie" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("invitations", () => {
  const row = {
    id: 1,
    guestName: "Anna Muster",
    note: null,
    status: "active",
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
    programItemIds: [],
    userId: 41,
    removesGuest: false,
    personType: "adult",
  };

  it("[INV-01][INV-04][INV-14] an admin creates invitations and gets cards with code and QR code", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [] } }),
      "POST /api/admin/invitations": () => ({
        status: 201,
        body: {
          invitations: [
            { ...row, code: "K7QMX4", url: "http://localhost:5173/invite/K7QMX4" },
            { ...row, id: 2, guestName: "Ben", code: "R4TW9C", url: "http://x/invite/R4TW9C" },
          ],
        },
      }),
    });
    renderAt("/admin/invitations");
    user.type(await screen.findByLabelText("Gäste (ein Name pro Zeile)"), "Anna Muster\n\nBen");
    user.type(screen.getByLabelText("Ablaufdatum (optional)"), "2027-05-01");
    user.click(screen.getByRole("button", { name: "2 Einladungen erstellen" }));

    expect(
      await screen.findByRole("heading", { name: "2 Einladungen erstellt" }),
    ).toBeInTheDocument();
    expect(screen.getByText("K7QMX4")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "QR-Code der Einladung für Anna Muster" }),
    ).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    expect(screen.getByRole("button", { name: "Karten drucken" })).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.csrf).toBe("csrf-1");
    // Valid through the chosen day, in the admin's time zone.
    expect(post?.body).toEqual({
      guests: [{ name: "Anna Muster" }, { name: "Ben" }],
      personType: "adult",
      expiresAt: new Date("2027-05-01T23:59:59").toISOString(),
    });

    // The codes are not shown again once the admin is done.
    user.click(screen.getByRole("button", { name: "Fertig" }));
    expect(await screen.findByRole("heading", { name: "Einladungen" })).toBeInTheDocument();
    expect(screen.queryByText("K7QMX4")).not.toBeInTheDocument();
  });

  it("[INV-05] an admin filters the list, revokes and regenerates a code", async () => {
    const redeemed = { ...row, id: 3, guestName: "Carla", status: "redeemed" };
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({
        status: 200,
        body: { invitations: [row, redeemed] },
      }),
      "POST /api/admin/invitations/1/revoke": () => ({
        status: 200,
        body: { ...row, status: "revoked" },
      }),
      "POST /api/admin/invitations/1/regenerate": () => ({
        status: 201,
        body: { ...row, id: 2, code: "AAAABB", url: "http://localhost:5173/invite/AAAABB" },
      }),
    });
    renderAt("/admin/invitations");
    expect(await screen.findByText("Carla")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Eingelöst 1" }));
    expect(screen.queryByText("Anna Muster")).not.toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Alle 2" }));

    user.click(screen.getByRole("button", { name: "Widerrufen: Anna Muster" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/invitations/1/revoke")).toBe(true);
    });
    user.click(screen.getByRole("button", { name: "Neu erzeugen: Anna Muster" }));
    expect(await screen.findByText("AAAABB")).toBeInTheDocument();
    // Redeemed codes can be neither revoked nor replaced.
    expect(screen.queryByRole("button", { name: "Widerrufen: Carla" })).not.toBeInTheDocument();
  });
});

describe("revoking removes a guest who never registered (INV-20)", () => {
  const open = {
    id: 1,
    guestName: "Anna Muster",
    note: null,
    status: "active",
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
    programItemIds: [],
    userId: 41,
    removesGuest: true,
    personType: "adult",
  };

  it("[INV-20] revoking the last open code asks for a second click, which names what happens", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [open] } }),
      "POST /api/admin/invitations/1/revoke": () => ({
        status: 200,
        body: { ...open, status: "revoked", userId: null, removesGuest: false, guestRemoved: true },
      }),
    });
    renderAt("/admin/invitations");
    user.click(await screen.findByRole("button", { name: "Widerrufen: Anna Muster" }));
    // The first click only asks.
    expect(calls.some((c) => c.path.endsWith("/revoke"))).toBe(false);
    const dialog = await screen.findByRole("alertdialog");
    user.click(within(dialog).getByRole("button", { name: "Widerrufen und Gast entfernen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/invitations/1/revoke")).toBe(true);
    });
    expect(calls.find((c) => c.path.endsWith("/revoke"))?.csrf).toBe("csrf-1");
  });

  it("[INV-20] a code that removes nobody is revoked with one click, and Abbrechen keeps the guest", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({
        status: 200,
        body: {
          invitations: [
            { ...open, removesGuest: false },
            { ...open, id: 2, guestName: "Ben", removesGuest: true },
          ],
        },
      }),
      "POST /api/admin/invitations/1/revoke": () => ({
        status: 200,
        body: { ...open, status: "revoked", guestRemoved: false },
      }),
    });
    renderAt("/admin/invitations");
    user.click(await screen.findByRole("button", { name: "Widerrufen: Anna Muster" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/invitations/1/revoke")).toBe(true);
    });
    user.click(screen.getByRole("button", { name: "Widerrufen: Ben" }));
    user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Abbrechen" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/admin/invitations/2/revoke")).toBe(false);
  });
});

describe("cleaning up invitations (INV-21)", () => {
  const base = {
    note: null,
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
    programItemIds: [],
    userId: null,
    removesGuest: false,
    personType: "adult",
  };

  it("[INV-05][INV-21] the filter chips, Aufräumen and its hint sit in the card of the table", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({
        status: 200,
        body: { invitations: [{ ...base, id: 1, guestName: "Alt", status: "revoked" }] },
      }),
    });
    renderAt("/admin/invitations");
    const table = await screen.findByRole("table");
    const card = table.closest(".card");
    expect(card).not.toBeNull();
    const inCard = within(card as HTMLElement);
    expect(inCard.getByRole("group", { name: "Nach Status filtern" })).toBeInTheDocument();
    const cleanup = await inCard.findByRole("button", { name: "Aufräumen (1)" });
    // Below the table, above its hint.
    const hint = inCard.getByText(/Aufräumen löscht widerrufene/);
    expect(table.compareDocumentPosition(cleanup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cleanup.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      inCard.getByText(
        "Aufräumen löscht widerrufene und ersetzte Einladungen. Eingelöste bleiben.",
      ),
    ).toBeInTheDocument();
  });

  it("[INV-21] Aufräumen names the number, asks for a second click and deletes revoked and replaced codes", async () => {
    let list = [
      { ...base, id: 1, guestName: "Alt", status: "revoked" },
      { ...base, id: 2, guestName: "Ersetzt", status: "replaced" },
      { ...base, id: 3, guestName: "Berta Bleibt", status: "active", userId: 7 },
    ];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: list } }),
      "POST /api/admin/invitations/cleanup": () => {
        list = list.filter((i) => i.status === "active");
        return { status: 200, body: { deleted: 2 } };
      },
    });
    renderAt("/admin/invitations");
    user.click(await screen.findByRole("button", { name: "Aufräumen (2)" }));
    expect(calls.some((c) => c.path.endsWith("/cleanup"))).toBe(false);
    expect(
      screen.getByText(/2 widerrufene und ersetzte Einladungen werden gelöscht/),
    ).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Endgültig aufräumen" }));
    await waitFor(() => {
      expect(screen.queryByText("Alt")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Berta Bleibt")).toBeInTheDocument();
    // Nothing left to clean up: no button.
    expect(screen.queryByRole("button", { name: /Aufräumen/ })).not.toBeInTheDocument();
  });

  it("[INV-22] only a redemption without its account can be deleted, after a second click", async () => {
    const orphan = { ...base, id: 4, guestName: "Dora", status: "redeemed", redeemedBy: null };
    const withAccount = { ...base, id: 5, guestName: "Emil", status: "redeemed", redeemedBy: 9 };
    let list = [orphan, withAccount];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: list } }),
      "DELETE /api/admin/invitations/4": () => {
        list = [withAccount];
        return { status: 204, body: null };
      },
    });
    renderAt("/admin/invitations");
    expect(await screen.findByText("Dora")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Löschen:/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Löschen: Emil" })).not.toBeInTheDocument();

    user.click(screen.getByRole("button", { name: "Löschen: Dora" }));
    expect(
      screen.getByText(
        "Die Einladung für Dora wird gelöscht. Ihr Code funktioniert danach nicht mehr.",
      ),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    user.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    await waitFor(() => {
      expect(screen.queryByText("Dora")).not.toBeInTheDocument();
    });
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/admin/invitations/4")).toBe(
      true,
    );
  });
});

describe("accounts, roles and groups", () => {
  it("[ACC-17] an inactive account is listed with its state and no username", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [account({ id: 5, username: null, displayName: "Ben Offen", status: "inactive" })],
        },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
    });
    renderAt("/admin/users");
    const row = (await screen.findByText("Ben Offen")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("inaktiv")).toBeInTheDocument();
    // No username yet, and the roles are locked until the guest registers.
    expect(
      within(row as HTMLElement).getByRole("button", { name: "vip für Ben Offen" }),
    ).toBeDisabled();
  });

  it("[ACC-17][ACC-18][ACC-20] the panel of an inactive account says so; only one an admin created gets a new setup link, a blocked one gets no link", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            account({ id: 2, username: null, displayName: "Ben Offen", status: "inactive" }),
            account({
              id: 3,
              username: "oma",
              displayName: "Oma Rosa",
              status: "inactive",
              vipAssignment: "admin_promotion",
            }),
            account({ id: 4, username: "cleo", displayName: "Cleo Gesperrt", status: "blocked" }),
          ],
        },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "POST /api/admin/users/3/reset-link": () => ({
        status: 201,
        body: { resetUrl: "http://x/set-password/new", expiresAt: "2026-11-13T10:00:00.000Z" },
      }),
    });
    renderAt("/admin/users");

    // Invited, not registered: the state, the way to the invitation, locked roles, no password.
    user.click(await screen.findByRole("button", { name: "Konto Ben Offen bearbeiten" }));
    let panel = await screen.findByRole("dialog", { name: "Ben Offen" });
    expect(within(panel).getByText("noch kein Benutzername")).toBeInTheDocument();
    expect(within(panel).getByText("Noch nicht angemeldet.")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Zur Einladung" })).toHaveAttribute(
      "href",
      "/admin/invitations",
    );
    expect(within(panel).getByRole("button", { name: "vip" })).toBeDisabled();
    expect(within(panel).queryByText("Passwort")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Konto löschen" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Konto sperren" })).not.toBeInTheDocument();
    user.click(within(panel).getByRole("button", { name: "Schliessen" }));

    // Created by an admin, link not used yet: free roles and a new setup link.
    user.click(screen.getByRole("button", { name: "Konto Oma Rosa bearbeiten" }));
    panel = await screen.findByRole("dialog", { name: "Oma Rosa" });
    expect(within(panel).queryByRole("link", { name: "Zur Einladung" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "vip" })).toBeEnabled();
    user.click(within(panel).getByRole("button", { name: "Neuen Einrichtungslink erstellen" }));
    expect(await within(panel).findByLabelText("Link zum Festlegen des Passworts")).toHaveValue(
      "http://x/set-password/new",
    );
    expect(calls.some((c) => c.path === "/api/admin/users/3/reset-link")).toBe(true);
    user.click(within(panel).getByRole("button", { name: "Schliessen" }));

    // Blocked: no link until the account is unblocked.
    user.click(screen.getByRole("button", { name: "Konto Cleo Gesperrt bearbeiten" }));
    panel = await screen.findByRole("dialog", { name: "Cleo Gesperrt" });
    expect(within(panel).queryByText("Passwort")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Entsperren" })).toBeInTheDocument();
  });

  it("[ACC-17][ACC-18] the table filters by state with counts and searches name and username", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            account({ id: 1, username: "anna", displayName: "Anna Muster" }),
            account({ id: 2, username: null, displayName: "Ben Offen", status: "inactive" }),
            account({ id: 3, username: "cleo", displayName: "Cleo Gesperrt", status: "blocked" }),
          ],
        },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
    });
    renderAt("/admin/users");
    await screen.findByText("Anna Muster");
    expect(screen.getByRole("button", { name: "Alle 3" })).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Gesperrt 1" }));
    expect(screen.queryByText("Anna Muster")).not.toBeInTheDocument();
    expect(screen.getByText("Cleo Gesperrt")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Alle 3" }));
    user.type(screen.getByRole("searchbox"), "ann");
    expect(screen.getByText("Anna Muster")).toBeInTheDocument();
    expect(screen.queryByText("Ben Offen")).not.toBeInTheDocument();
  });

  it("[ACC-18] blocking asks for a second click; a blocked account is unblocked with one", async () => {
    let accounts = [account({ id: 1, username: "anna", displayName: "Anna Muster" })];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: accounts } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: false,
          personType: "adult",
          companionApproval: false,
          pendingCount: 0,
          programItems: [],
          menus: [],
        },
      }),
      "POST /api/admin/users/1/block": () => {
        accounts = [{ ...accounts[0], status: "blocked" } as (typeof accounts)[number]];
        return { status: 204 };
      },
      "POST /api/admin/users/1/unblock": () => {
        accounts = [{ ...accounts[0], status: "active" } as (typeof accounts)[number]];
        return { status: 204 };
      },
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "Konto Anna Muster bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    user.click(within(panel).getByRole("button", { name: "Konto sperren" }));
    expect(calls.some((c) => c.path.endsWith("/block"))).toBe(false);
    user.click(await within(panel).findByRole("button", { name: "Endgültig sperren" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/users/1/block")).toBe(true);
    });
    // Blocked: no password section, "Entsperren" instead of "Konto sperren".
    const unblock = await within(panel).findByRole("button", { name: "Entsperren" });
    expect(
      within(panel).queryByRole("button", { name: "Link zum Zurücksetzen erstellen" }),
    ).not.toBeInTheDocument();
    user.click(unblock);
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/users/1/unblock")).toBe(true);
    });
  });

  it("[ACC-19] deleting an account asks for a second click and closes the panel", async () => {
    let accounts = [account({ id: 1, username: "anna", displayName: "Anna Muster" })];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: accounts } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: false,
          personType: "adult",
          companionApproval: false,
          pendingCount: 0,
          programItems: [],
          menus: [],
        },
      }),
      "DELETE /api/admin/users/1": () => {
        accounts = [];
        return { status: 204 };
      },
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "Konto Anna Muster bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    user.click(within(panel).getByRole("button", { name: "Konto löschen" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(
      within(panel).getByText(/mit Rückmeldung, Begleitpersonen und allen Einladungen gelöscht/),
    ).toBeInTheDocument();
    user.click(within(panel).getByRole("button", { name: "Endgültig löschen" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(calls.find((c) => c.method === "DELETE")?.csrf).toBe("csrf-1");
    await waitFor(() => {
      expect(screen.queryByText("Anna Muster")).not.toBeInTheDocument();
    });
  });

  it("[ROLE-01][ROLE-09] a role chip switches one role and keeps the others", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: [account()] } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "PUT /api/admin/users/1/roles": () => ({ status: 200, body: anna }),
    });
    renderAt("/admin/users");
    const staff = await screen.findByRole("button", { name: "staff für Anna" });
    expect(staff).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "vip für Anna" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    user.click(staff);
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PUT")).toMatchObject({
        csrf: "csrf-1",
        body: { roles: ["vip", "staff"] },
      });
    });
  });

  it("[ROLE-01] the last admin keeps the role, and the page says why", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({
        status: 200,
        body: { users: [account({ ...admin, vipAssignment: null })] },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "PUT /api/admin/users/9/roles": () => ({
        status: 409,
        body: { error: { code: "last_admin", message: "x" } },
      }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "admin für Lea" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Es braucht immer mindestens eine Admin-Person.",
    );
  });

  it("[ROLE-06][ACC-10] the account panel switches capabilities of staff and creates a reset link", async () => {
    const staff = account({ id: 2, username: "ben", displayName: "Ben", roles: ["staff"] });
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: [account(), staff] } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "PUT /api/admin/users/2/capabilities": () => ({ status: 200, body: staff }),
      "POST /api/admin/users/1/reset-link": () => ({
        status: 201,
        body: { resetUrl: "http://x/set-password/tok", expiresAt: "2026-11-11T10:00:00.000Z" },
      }),
    });
    renderAt("/admin/users");

    // Only staff members have capabilities.
    user.click(await screen.findByRole("button", { name: "Konto Anna bearbeiten" }));
    let panel = await screen.findByRole("dialog", { name: "Anna" });
    expect(within(panel).getByRole("button", { name: "Moderation" })).toBeDisabled();
    expect(within(panel).getByText("vip per Einladungscode")).toBeInTheDocument();

    // A reset link to hand over, shown with its expiry.
    user.click(within(panel).getByRole("button", { name: "Link zum Zurücksetzen erstellen" }));
    expect(await within(panel).findByLabelText("Link zum Zurücksetzen")).toHaveValue(
      "http://x/set-password/tok",
    );
    user.click(within(panel).getByRole("button", { name: "Schliessen" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    user.click(screen.getByRole("button", { name: "Konto Ben bearbeiten" }));
    panel = await screen.findByRole("dialog", { name: "Ben" });
    user.click(within(panel).getByRole("button", { name: "Moderation" }));
    await waitFor(() => {
      expect(calls.find((c) => c.path === "/api/admin/users/2/capabilities")?.body).toEqual({
        capabilities: ["moderateContributions"],
      });
    });
  });

  it("[ACC-08] an admin creates an account and gets the setup link", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({ status: 200, body: { users: [] } }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: false,
          personType: "adult",
          companionApproval: false,
          pendingCount: 0,
          programItems: [
            {
              id: 1,
              name: "Trauung",
              startsAt: "2027-06-12T12:00:00.000Z",
              place: null,
              hasMeal: false,
            },
            {
              id: 2,
              name: "Dinner",
              startsAt: "2027-06-12T16:00:00.000Z",
              place: null,
              hasMeal: true,
            },
          ],
          menus: [],
        },
      }),
      "POST /api/admin/users": () => ({
        status: 201,
        body: {
          user: { ...anna, id: 5, username: "oma", displayName: "Oma Erika" },
          setupUrl: "http://x/set-password/setup",
          expiresAt: "2026-11-11T10:00:00.000Z",
        },
      }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "+ Konto anlegen" }));
    const panel = await screen.findByRole("dialog", { name: "Konto anlegen" });
    user.type(within(panel).getByLabelText("Benutzername"), "oma");
    user.type(within(panel).getByLabelText("Anzeigename (optional)"), "Oma Erika");
    // A new guest needs program items (ACC-20): none selected, so nothing can be sent yet.
    user.click(within(panel).getByRole("button", { name: "vip" }));
    const submit = within(panel).getByRole("button", { name: "Konto anlegen" });
    expect(await within(panel).findByRole("button", { name: "Trauung" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(submit).toBeDisabled();
    user.click(within(panel).getByRole("button", { name: "Dinner" }));
    expect(submit).toBeEnabled();
    user.click(submit);

    const done = await screen.findByRole("dialog", { name: "Konto für Oma Erika angelegt" });
    expect(within(done).getByLabelText("Link zum Festlegen des Passworts")).toHaveValue(
      "http://x/set-password/setup",
    );
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      username: "oma",
      displayName: "Oma Erika",
      roles: ["vip"],
      programItemIds: [2],
    });
  });

  it("[GRP-01] an admin creates a group, manages its members, renames and deletes it", async () => {
    let groups = [{ id: 4, name: "Trauzeugen", memberIds: [1] }];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            account({ groups: [{ id: 4, name: "Trauzeugen" }] }),
            account({ id: 2, username: "ben", displayName: "Ben" }),
            account({ id: 3, username: null, displayName: "Carla Offen", status: "inactive" }),
          ],
        },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups } }),
      "POST /api/admin/groups": () => ({
        status: 201,
        body: { id: 5, name: "Familie", memberIds: [] },
      }),
      "PUT /api/admin/groups/4/members/2": () => ({ status: 204 }),
      "DELETE /api/admin/groups/4/members/1": () => ({ status: 204 }),
      "PATCH /api/admin/groups/4": () => ({ status: 204 }),
      "DELETE /api/admin/groups/4": () => {
        groups = [];
        return { status: 204 };
      },
    });
    renderAt("/admin/users");

    user.click(await screen.findByRole("button", { name: "+ Neu" }));
    user.type(screen.getByLabelText("Name der Gruppe"), "Familie");
    user.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => {
      expect(
        calls.find((c) => c.path === "/api/admin/groups" && c.method === "POST")?.body,
      ).toEqual({ name: "Familie" });
    });

    user.click(screen.getByRole("button", { name: /Trauzeugen/ }));
    const panel = await screen.findByRole("dialog", { name: "Trauzeugen" });
    expect(within(panel).getByText("1 Person")).toBeInTheDocument();
    // An invited guest who has not registered has no username: the name alone, no empty brackets.
    expect(within(panel).getByRole("option", { name: "Ben (ben)" })).toBeInTheDocument();
    expect(within(panel).getByRole("option", { name: "Carla Offen" })).toBeInTheDocument();
    user.type(within(panel).getByLabelText("Person hinzufügen"), "2");
    user.click(within(panel).getByRole("button", { name: "Hinzufügen" }));
    user.click(within(panel).getByRole("button", { name: "Anna aus der Gruppe entfernen" }));
    user.type(within(panel).getByLabelText("Name der Gruppe"), "Trauzeug:innen");
    user.click(within(panel).getByRole("button", { name: "Umbenennen" }));
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ name: "Trauzeug:innen" });
    });
    expect(calls.some((c) => c.method === "PUT" && c.path.endsWith("/members/2"))).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/members/1"))).toBe(true);

    // Deleting needs a second click.
    user.click(within(panel).getByRole("button", { name: "Gruppe löschen" }));
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/admin/groups/4")).toBe(
      false,
    );
    user.click(within(panel).getByRole("button", { name: "Endgültig löschen" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Noch keine Gruppen.")).toBeInTheDocument();
  });
});

describe("event setup", () => {
  const fresh = {
    ...event,
    name: null,
    timezone: null,
    defaultLanguage: null,
    setupComplete: false,
  };

  /** A fresh installation; POST /setup completes it like the real server. */
  function freshBackend(session: unknown) {
    let current: Record<string, unknown> = fresh;
    const calls = fakeBackend({
      "GET /api/session": () => session as { status: number; body: unknown },
      "GET /api/event": () => ({ status: 200, body: current }),
      "POST /api/admin/event/setup": () => {
        current = { ...event, ...(calls.at(-1)?.body as object), setupComplete: true };
        return { status: 200, body: current };
      },
    });
    return calls;
  }

  it("[CFG-02] on a fresh installation an admin sees only the setup form; saving opens the admin area", async () => {
    const calls = freshBackend(asAdmin);
    renderAt("/admin/users");
    expect(
      await screen.findByRole("heading", { name: "Veranstaltung einrichten" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Verwaltung" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Zeitzone")).toHaveValue("Europe/Zurich");

    user.type(screen.getByLabelText("Name"), "Anna & Ben");
    user.click(screen.getByRole("button", { name: "Einrichtung abschliessen" }));

    expect(await screen.findByRole("navigation", { name: "Verwaltung" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/setup"))).toMatchObject({
      csrf: "csrf-1",
      body: { name: "Anna & Ben", timezone: "Europe/Zurich", defaultLanguage: "de" },
    });
  });

  it("[CFG-02] an admin on the website is sent to the setup", async () => {
    freshBackend(asAdmin);
    renderAt("/");
    expect(
      await screen.findByRole("heading", { name: "Veranstaltung einrichten" }),
    ).toBeInTheDocument();
  });

  it("[CFG-02] everyone else sees the 'not set up yet' page and can sign out", async () => {
    freshBackend(signedIn);
    renderAt("/");
    expect(
      await screen.findByRole("heading", { name: "Noch nicht eingerichtet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).not.toBeInTheDocument();
  });

  it("[CFG-02] an invalid input is reported and the form stays", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: fresh }),
      "POST /api/admin/event/setup": () => ({
        status: 400,
        body: { error: { code: "validation_failed", message: "x" } },
      }),
    });
    renderAt("/admin");
    user.type(await screen.findByLabelText("Name"), "Anna & Ben");
    user.click(screen.getByRole("button", { name: "Einrichtung abschliessen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitte prüfe deine Eingaben.");
    expect(screen.getByRole("heading", { name: "Veranstaltung einrichten" })).toBeInTheDocument();
  });

  it("[CFG-06] Einstellungen changes name and time zone later and sends only what changed", async () => {
    let current: Record<string, unknown> = event;
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: current }),
      "PATCH /api/admin/event": () => {
        current = { ...current, ...(calls.at(-1)?.body as object) };
        return { status: 200, body: current };
      },
    });
    renderAt("/admin/settings");
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Event Muster");
    user.type(name, "Anna & Ben");
    user.type(screen.getByLabelText("Zeitzone"), "Europe/Berlin");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Gespeichert.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      name: "Anna & Ben",
      timezone: "Europe/Berlin",
    });
  });
});
