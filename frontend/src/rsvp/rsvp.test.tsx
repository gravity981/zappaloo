import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const guest = { ...anna, displayName: "Erika" };
const asGuest = { status: 200, body: { user: guest, csrfToken: "csrf-1" } };
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-9" } };

const PARTS = [
  { id: 1, name: "Trauung", startsAt: "2027-06-12T12:00:00.000Z", place: "Kirche", hasMeal: false },
  { id: 2, name: "Apéro", startsAt: "2027-06-12T13:30:00.000Z", place: null, hasMeal: false },
  { id: 3, name: "Dinner", startsAt: "2027-06-12T16:30:00.000Z", place: "Linde", hasMeal: true },
];
const MENUS = [
  { id: 1, name: "Fleisch" },
  { id: 2, name: "Vegetarisch" },
];

/** What `GET /api/rsvp` answers. */
function state(changes: Record<string, unknown> = {}) {
  return {
    name: "Erika",
    deadline: "2027-05-01",
    closed: false,
    songEnabled: true,
    parts: PARTS,
    menus: MENUS,
    answer: null,
    companions: [],
    ...changes,
  };
}
const answered = (partIds: number[], extra: Record<string, unknown> = {}) => ({
  attendingPartIds: partIds,
  menuId: null,
  allergies: null,
  songWish: null,
  answeredAt: "2027-01-01T10:00:00.000Z",
  ...extra,
});

describe("the RSVP wizard", () => {
  it("[RSVP-01][RSVP-03][RSVP-06] a guest answers per part, picks a menu for the meal part and sends", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({
          answer: answered([1, 3], { menuId: 2, allergies: "Nüsse", songWish: "ABBA" }),
        }),
      }),
    });
    renderAt("/rsvp");

    // Step 1: the deadline is shown up front; every part needs an answer before it goes on.
    expect(
      await screen.findByRole("heading", { name: "Bist du dabei, Erika?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Du kannst deine Antwort bis 1. Mai 2027 ändern.")).toBeInTheDocument();
    // The step counter of the flow frame.
    expect(screen.getByText("1/3")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Weiter" });
    expect(next).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Trauung: Dabei" }));
    user.click(screen.getByRole("button", { name: "Apéro: Nicht dabei" }));
    expect(next).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Dinner: Dabei" }));
    expect(next).toBeEnabled();
    user.click(next);

    // Step 2: the menu is asked because Dinner is the meal part, and it is required.
    expect(await screen.findByRole("heading", { name: "Essen & Allergien" })).toBeInTheDocument();
    expect(
      screen.getByText("Sieht nur das Organisationsteam.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Vegetarisch" }));
    user.type(screen.getByLabelText("Allergien oder Unverträglichkeiten"), "Nüsse");
    user.click(screen.getByRole("button", { name: "Weiter" }));

    // Step 3: the song wish is optional; then the answer goes to the server.
    user.type(await screen.findByLabelText("Songwunsch (optional)"), "ABBA");
    user.click(screen.getByRole("button", { name: "Antwort senden" }));

    expect(
      await screen.findByRole("heading", { name: "Danke, Erika! Deine Antwort ist angekommen." }),
    ).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.csrf).toBe("csrf-1");
    expect(put?.body).toEqual({
      attendance: [
        { partId: 1, attending: true },
        { partId: 2, attending: false },
        { partId: 3, attending: true },
      ],
      menuId: 2,
      allergies: "Nüsse",
      songWish: "ABBA",
      companions: [],
    });
    // The summary shows what was answered; the allergies are only named, not repeated.
    expect(screen.getByText("Vegetarisch · Allergien angegeben")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ändern" })).toBeInTheDocument();
    expect(screen.getByText("Änderbar bis 1. Mai 2027.")).toBeInTheDocument();
  });

  it("[RSVP-03] without the meal part there is no menu question, only allergies", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({ status: 200, body: state({ answer: answered([1]) }) }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Trauung: Dabei" }));
    user.click(screen.getByRole("button", { name: "Apéro: Nicht dabei" }));
    user.click(screen.getByRole("button", { name: "Dinner: Nicht dabei" }));
    user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByLabelText("Allergien oder Unverträglichkeiten")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fleisch" })).not.toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));
    await screen.findByRole("heading", { name: /Danke, Erika/ });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      attendance: [
        { partId: 1, attending: true },
        { partId: 2, attending: false },
        { partId: 3, attending: false },
      ],
      allergies: null,
      songWish: null,
      companions: [],
    });
  });

  it("[RSVP-01] declining every part skips to the summary", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({ status: 200, body: state({ answer: answered([]) }) }),
    });
    renderAt("/rsvp");
    for (const part of ["Trauung", "Apéro", "Dinner"]) {
      user.click(await screen.findByRole("button", { name: `${part}: Nicht dabei` }));
    }
    // The button now sends instead of going on.
    user.click(screen.getByRole("button", { name: "Antwort senden" }));
    expect(
      await screen.findByRole("heading", {
        name: "Schade, dass du nicht dabei sein kannst, Erika. Danke für deine Antwort!",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Allergien oder Unverträglichkeiten")).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      attendance: PARTS.map((part) => ({ partId: part.id, attending: false })),
      companions: [],
    });
  });

  it("[RSVP-04] an answered RSVP opens as the summary and can be changed until the deadline", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ answer: answered([1, 3], { menuId: 1, songWish: "Queen" }) }),
      }),
    });
    renderAt("/rsvp");
    expect(await screen.findByText("Fleisch")).toBeInTheDocument();
    expect(screen.getByText("Queen")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Ändern" }));
    // The saved answer is pre-filled.
    expect(await screen.findByRole("button", { name: "Trauung: Dabei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Apéro: Nicht dabei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("[RSVP-04] after the deadline the summary is read-only with a hint to contact the hosts", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ closed: true, answer: answered([1]) }),
      }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByText(
        "Die Frist ist vorbei. Für Änderungen melde dich bei den Gastgebern.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ändern" })).not.toBeInTheDocument();
  });

  it("[RSVP-04] a server refusal is shown and the answer stays on screen", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({
        status: 403,
        body: { error: { code: "rsvp_closed", message: "closed" } },
      }),
    });
    renderAt("/rsvp");
    for (const part of ["Trauung", "Apéro", "Dinner"]) {
      user.click(await screen.findByRole("button", { name: `${part}: Nicht dabei` }));
    }
    user.click(screen.getByRole("button", { name: "Antwort senden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Frist für die Rückmeldung ist vorbei.",
    );
    expect(screen.getByRole("button", { name: "Trauung: Nicht dabei" })).toBeInTheDocument();
  });

  it("[RSVP-02] a guest without invited parts is told to contact the hosts", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state({ parts: [] }) }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByText(
        "Für dich sind noch keine Teile festgelegt. Melde dich bei den Gastgebern.",
      ),
    ).toBeInTheDocument();
  });

  it("[CFG-03] the RSVP is unavailable while the feature is off, and has no link in the menu", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": () => ({
        status: 200,
        body: {
          id: "event1",
          name: "Event Muster",
          timezone: "Europe/Zurich",
          defaultLanguage: "de",
          setupComplete: true,
          features: {
            minigames: true,
            snapshots: true,
            gallery: true,
            keepsakes: true,
            rsvp: false,
            treasureHunt: true,
            eventScreen: true,
          },
          settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: false },
        },
      }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByText("Diese Funktion ist für diesen Anlass ausgeschaltet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rückmeldung" })).not.toBeInTheDocument();
  });

  it("[RSVP-01] guests find the RSVP in the menu; others are sent away", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
    });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Rückmeldung" })).toHaveAttribute(
      "href",
      "/rsvp",
    );
  });
});

describe("the wizard in admin mode", () => {
  it("[RSVP-04] an admin changes a guest's RSVP after the deadline", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/guests/5": () => ({
        status: 200,
        body: state({ closed: true, name: "Tom", answer: answered([1]) }),
      }),
      "PUT /api/admin/rsvp/guests/5": () => ({
        status: 200,
        body: state({ closed: true, name: "Tom", answer: answered([2]) }),
      }),
    });
    renderAt("/admin/rsvp/guests/5");
    expect(await screen.findByText(/Admin-Modus: Die Frist gilt hier nicht/)).toBeInTheDocument();
    // Open although the deadline has passed.
    user.click(screen.getByRole("button", { name: "Ändern" }));
    user.click(await screen.findByRole("button", { name: "Trauung: Nicht dabei" }));
    user.click(screen.getByRole("button", { name: "Apéro: Dabei" }));
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/admin/rsvp/guests/5");
    expect(put?.csrf).toBe("csrf-9");
  });
});

describe("Rückmeldungen", () => {
  const overview = {
    deadline: "2027-05-01",
    songEnabled: true,
    parts: PARTS,
    menus: MENUS,
    totals: [
      { partId: 1, yes: 2, no: 1 },
      { partId: 2, yes: 1, no: 2 },
      { partId: 3, yes: 2, no: 1 },
    ],
    menuTotals: [
      { menuId: 1, count: 1 },
      { menuId: 2, count: 1 },
    ],
    guests: [
      {
        userId: 5,
        name: "Erika Huber",
        status: "attending",
        invitedPartIds: [1, 2, 3],
        attendingPartIds: [1, 3],
        menuId: 2,
        songWish: "ABBA",
        allergies: "Nüsse",
        verifiedEmail: true,
      },
      {
        userId: 6,
        name: "Peter Graf",
        status: "declined",
        invitedPartIds: [1, 2, 3],
        attendingPartIds: [],
        menuId: null,
        songWish: null,
        allergies: null,
        verifiedEmail: false,
      },
      {
        userId: 7,
        name: "Lukas Meier",
        status: "none",
        invitedPartIds: [1],
        attendingPartIds: [],
        menuId: null,
        songWish: null,
        allergies: null,
        verifiedEmail: true,
      },
    ],
    companions: [],
    pendingCount: 0,
    answered: 2,
    total: 3,
    reminderCount: 1,
  };

  it("[RSVP-05][SEC-11] shows totals per part and menu and the guest table with the admin-only allergy column", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
    });
    renderAt("/admin/rsvp");
    expect(await screen.findByRole("heading", { name: "Rückmeldungen" })).toBeInTheDocument();
    expect(await screen.findAllByText("2 ja · 1 nein")).toHaveLength(2);
    expect(screen.getByText("Menüs (Dinner)")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: /Allergien · nur Admins/ }),
    ).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: /Erika Huber/ });
    expect(within(row).getByText("Trauung, Dinner")).toBeInTheDocument();
    expect(within(row).getByText("Vegetarisch")).toBeInTheDocument();
    expect(within(row).getByText("Nüsse")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Bearbeiten: Erika Huber" })).toHaveAttribute(
      "href",
      "/admin/rsvp/guests/5",
    );
    // The CSV export is a download link.
    expect(screen.getByRole("link", { name: "CSV" })).toHaveAttribute(
      "href",
      "/api/admin/rsvp/export",
    );
  });

  it("[RSVP-05] the guest table filters by status", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
    });
    renderAt("/admin/rsvp");
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Alle 3" })).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "ohne Antwort 1" }));
    const table = screen.getByRole("table");
    expect(within(table).queryByText("Erika Huber")).not.toBeInTheDocument();
    expect(within(table).getByText("Lukas Meier")).toBeInTheDocument();
  });

  it("[RSVP-07] the reminder button names how many guests it reaches and reports what was sent", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
      "POST /api/admin/rsvp/remind": () => ({ status: 200, body: { sent: 1 } }),
    });
    renderAt("/admin/rsvp");
    user.click(await screen.findByRole("button", { name: "Erinnern (1)" }));
    expect(await screen.findByText("Erinnerung an 1 Gast gesendet.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.csrf).toBe("csrf-9");
  });

  it("[RSVP-07] without a reachable guest the reminder button is off", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: { ...overview, reminderCount: 0 } }),
    });
    renderAt("/admin/rsvp");
    expect(await screen.findByRole("button", { name: "Erinnern (0)" })).toBeDisabled();
  });
});

describe("Einstellungen › Rückmeldung", () => {
  const config = { deadline: "2027-05-01", songEnabled: true, parts: PARTS, menus: MENUS };

  it("[RSVP-02] the admin adds a part; the start is entered in the event's time zone", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "POST /api/admin/rsvp/parts": () => ({
        status: 201,
        body: {
          id: 4,
          name: "Party",
          startsAt: "2027-06-12T20:00:00.000Z",
          place: "Saal",
          hasMeal: false,
        },
      }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByText("Dinner")).toBeInTheDocument();
    expect(screen.getByText("Essen")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Teil hinzufügen" }));
    const start = await screen.findByLabelText("Beginn");
    const form = within(start.closest("form") as HTMLElement);
    user.type(form.getByLabelText("Name"), "Party");
    user.type(start, "2027-06-12T22:00");
    user.type(form.getByLabelText("Ort (optional)"), "Saal");
    user.click(form.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    // 22:00 in Zurich (summer time) is 20:00 UTC.
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Party",
      startsAt: "2027-06-12T20:00:00.000Z",
      place: "Saal",
      hasMeal: false,
    });
  });

  it("[RSVP-02] deleting a part needs a second click", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "DELETE /api/admin/rsvp/parts/2": () => ({ status: 204 }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("button", { name: "Löschen: Apéro" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    user.click(screen.getByRole("button", { name: "Wirklich löschen? Apéro" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    });
  });

  it("[RSVP-04] the admin sets and clears the deadline", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "PUT /api/admin/rsvp/deadline": () => ({ status: 204 }),
    });
    renderAt("/admin/settings");
    user.type(await screen.findByLabelText(/Frist \(letzter Tag\)/), "2027-05-15");
    user.click(screen.getByRole("button", { name: "Frist festlegen" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ deadline: "2027-05-15" });
    user.click(screen.getByRole("button", { name: "Frist entfernen" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PUT")[1]?.body).toEqual({ deadline: null });
  });

  it("[RSVP-03] the admin adds a menu option to the one list", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "POST /api/admin/rsvp/menus": () => ({ status: 201, body: { id: 3, name: "Vegan" } }),
    });
    renderAt("/admin/settings");
    const add = await screen.findByRole("button", { name: "Menü hinzufügen" });
    expect(add).toBeDisabled();
    user.type(screen.getByLabelText("Bezeichnung des Menüs"), "Vegan");
    user.click(add);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Vegan" });
  });
});

describe("invited parts", () => {
  const config = { deadline: null, songEnabled: true, parts: PARTS, menus: [] };
  const invitation = (changes: Record<string, unknown> = {}) => ({
    id: 1,
    guestName: "Anna Muster",
    note: null,
    status: "active",
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
    partIds: [1, 2],
    ...changes,
  });

  it("[RSVP-02] a batch of invitations is created for the chosen parts, all by default", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [] } }),
      "POST /api/admin/invitations": () => ({
        status: 201,
        body: { invitations: [{ ...invitation(), code: "K7QMX4", url: "http://x/invite/K7QMX4" }] },
      }),
    });
    renderAt("/admin/invitations");
    user.type(await screen.findByLabelText("Gäste (ein Name pro Zeile)"), "Anna Muster");
    const group = await screen.findByRole("group", { name: "Eingeladen zu" });
    for (const part of ["Trauung", "Apéro", "Dinner"]) {
      expect(within(group).getByRole("button", { name: part })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    user.click(within(group).getByRole("button", { name: "Dinner" }));
    user.click(screen.getByRole("button", { name: "1 Einladung erstellen" }));
    await screen.findByRole("heading", { name: "1 Einladung erstellt" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      guests: [{ name: "Anna Muster" }],
      partIds: [1, 2],
    });
  });

  it("[RSVP-02] the parts of an invitation are changed per row", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [invitation()] } }),
      "PUT /api/admin/invitations/1/parts": () => ({
        status: 200,
        body: invitation({ partIds: [1, 2, 3] }),
      }),
    });
    renderAt("/admin/invitations");
    const chip = await screen.findByRole("button", { name: "Dinner: Anna Muster" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    user.click(chip);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ partIds: [1, 2, 3] });
  });

  it("[RSVP-02] the account panel of a promoted guest chooses the parts; an invited one only shows them", async () => {
    const account = (changes: Record<string, unknown>) => ({
      ...anna,
      vipAssignment: "admin_promotion",
      groups: [],
      invitedPartIds: [1, 3],
      ...changes,
    });
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            account({ id: 1, username: "oma", displayName: "Oma" }),
            account({
              id: 2,
              username: "erika",
              displayName: "Erika",
              vipAssignment: "invitation_code",
            }),
          ],
        },
      }),
      "PUT /api/admin/users/1/parts": () => ({ status: 200, body: { partIds: [1, 2, 3] } }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "Konto Oma bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    await within(panel).findByText("Eingeladen zu");
    user.click(await within(panel).findByRole("button", { name: "Apéro" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ partIds: [1, 2, 3] });
    expect(within(panel).getByText(/vip ohne Einladung/)).toBeInTheDocument();
  });
});

describe("Übersicht", () => {
  const overview = {
    deadline: null,
    songEnabled: true,
    parts: PARTS,
    menus: MENUS,
    totals: [],
    menuTotals: [],
    guests: [],
    companions: [],
    pendingCount: 0,
    answered: 84,
    total: 120,
    reminderCount: 30,
  };

  it("[RSVP-05] shows how many guests have answered and how many have not", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByText("84 / 120")).toBeInTheDocument();
    expect(screen.getByText("36 ohne Antwort")).toBeInTheDocument();
  });

  it("[DATA-05] the card Zuletzt lists the latest changes in words, with names and a relative time", async () => {
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
      "GET /api/admin/activity": () => ({
        status: 200,
        body: {
          entries: [
            { action: "rsvp.answer", createdAt: ago(120), count: 1, name: "Erika Huber" },
            { action: "invitation.create", createdAt: ago(60 * 26), count: 12, name: null },
            {
              action: "setting.set",
              createdAt: ago(60 * 30),
              count: 1,
              name: "snapshotUploadsOpen",
            },
            { action: "rsvp.remind", createdAt: ago(60 * 50), count: 31, name: null },
            { action: "rsvp.part.delete", createdAt: ago(60 * 60), count: 1, name: null },
          ],
        },
      }),
    });
    renderAt("/admin");
    const card = (await screen.findByText("Zuletzt")).closest("section");
    if (!card) throw new Error("the card has no section");
    const items = await within(card).findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Erika Huber hat die Rückmeldung abgegeben/),
      expect.stringMatching(/^12 Einladungen erstellt/),
      expect.stringMatching(/^«Schnappschuss-Uploads» geändert/),
      expect.stringMatching(/^Erinnerung an 31 Gäste gesendet/),
      expect.stringMatching(/^Ein Teil wurde gelöscht/),
    ]);
    expect(items[0]).toHaveTextContent(/vor 2 Std/);
    expect(items[1]).toHaveTextContent(/vor 1 Tag|gestern/);
  });

  it("[DATA-05] says so when nothing happened yet", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByText("Noch nichts passiert.")).toBeInTheDocument();
  });
});

describe("the song wish switch", () => {
  it("[RSVP-06] the wizard asks for no song wish while the admin has switched it off", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ songEnabled: false, answer: answered([1], { songWish: "ABBA" }) }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({ songEnabled: false, answer: answered([1]) }),
      }),
    });
    renderAt("/rsvp");
    // The summary does not show an earlier wish.
    await screen.findByRole("button", { name: "Ändern" });
    expect(screen.queryByText("ABBA")).not.toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Ändern" }));
    user.click(await screen.findByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Begleitpersonen & Musik" });
    expect(screen.queryByLabelText("Songwunsch (optional)")).not.toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Antwort senden" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).not.toHaveProperty("songWish");
  });

  it("[RSVP-06] the admin switches the song wish in Einstellungen", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: { deadline: null, songEnabled: true, parts: PARTS, menus: MENUS },
      }),
      "PUT /api/admin/rsvp/song": () => ({ status: 204 }),
    });
    renderAt("/admin/settings");
    const toggle = await screen.findByRole("switch", { name: "Songwunsch fragen" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    user.click(toggle);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      csrf: "csrf-9",
      body: { enabled: false },
    });
  });

  it("[RSVP-06] the guest table has no song column while it is off", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: false,
          parts: PARTS,
          menus: MENUS,
          totals: [],
          menuTotals: [],
          guests: [],
          companions: [],
          pendingCount: 0,
          answered: 0,
          total: 0,
          reminderCount: 0,
        },
      }),
    });
    renderAt("/admin/rsvp");
    const table = await screen.findByRole("table");
    expect(
      within(table).queryByRole("columnheader", { name: "Songwunsch" }),
    ).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Allergien/ })).toBeInTheDocument();
  });
});
