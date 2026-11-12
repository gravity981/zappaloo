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
    perItem: true,
    companionApproval: true,
    programItems: PARTS,
    menus: MENUS,
    answer: null,
    companions: [],
    ...changes,
  };
}
const answered = (programItemIds: number[], extra: Record<string, unknown> = {}) => ({
  attendingItemIds: programItemIds,
  declinedItemIds: PARTS.map((programItem) => programItem.id).filter(
    (id) => !programItemIds.includes(id),
  ),
  menuId: null,
  allergies: null,
  songWish: null,
  answeredAt: "2027-01-01T10:00:00.000Z",
  ...extra,
});

describe("the RSVP wizard", () => {
  it("[RSVP-01][RSVP-03][RSVP-06] a guest answers per program item, picks a menu for the meal program item and sends", async () => {
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

    // Step 1: the deadline is shown up front; every program item needs an answer before it goes on.
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

    // Step 2: the menu is asked because Dinner is the meal program item, and it is required.
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
        { programItemId: 1, attending: true },
        { programItemId: 2, attending: false },
        { programItemId: 3, attending: true },
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

  it("[RSVP-03] without the meal program item there is no menu question, only allergies", async () => {
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
        { programItemId: 1, attending: true },
        { programItemId: 2, attending: false },
        { programItemId: 3, attending: false },
      ],
      allergies: null,
      songWish: null,
      companions: [],
    });
  });

  it("[RSVP-01] declining every program item skips to the summary", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({ status: 200, body: state({ answer: answered([]) }) }),
    });
    renderAt("/rsvp");
    for (const programItem of ["Trauung", "Apéro", "Dinner"]) {
      user.click(await screen.findByRole("button", { name: `${programItem}: Nicht dabei` }));
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
      attendance: PARTS.map((programItem) => ({ programItemId: programItem.id, attending: false })),
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

  it("[RSVP-02] a program item added after the answer is open: the summary says so and the wizard asks for it", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        // Dinner was added to the invitation after Erika answered.
        body: state({ answer: answered([1], { declinedItemIds: [2] }) }),
      }),
    });
    renderAt("/rsvp");
    // The wizard starts at the attendance, with what was answered pre-filled.
    expect(await screen.findByRole("button", { name: "Trauung: Dabei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Apéro: Nicht dabei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const name of ["Dinner: Dabei", "Dinner: Nicht dabei"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Dinner: Nicht dabei" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
    });
  });

  it("[RSVP-02] after the deadline an open program item is shown as such in the summary", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ closed: true, answer: answered([1], { declinedItemIds: [2] }) }),
      }),
    });
    renderAt("/rsvp");
    expect(await screen.findByText("Noch offen")).toBeInTheDocument();
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
    for (const programItem of ["Trauung", "Apéro", "Dinner"]) {
      user.click(await screen.findByRole("button", { name: `${programItem}: Nicht dabei` }));
    }
    user.click(screen.getByRole("button", { name: "Antwort senden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Frist für die Rückmeldung ist vorbei.",
    );
    expect(screen.getByRole("button", { name: "Trauung: Nicht dabei" })).toBeInTheDocument();
  });

  it("[RSVP-02] a guest without invited program items is told to contact the hosts", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state({ programItems: [] }) }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByText(
        "Für dich sind noch keine Programmpunkte festgelegt. Melde dich bei den Gastgebern.",
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
    perItem: true,
    companionApproval: true,
    programItems: PARTS,
    menus: MENUS,
    totals: [
      { programItemId: 1, yes: 2, no: 1 },
      { programItemId: 2, yes: 1, no: 2 },
      { programItemId: 3, yes: 2, no: 1 },
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
        invitedProgramItemIds: [1, 2, 3],
        attendingItemIds: [1, 3],
        declinedItemIds: [2],
        menuId: 2,
        songWish: "ABBA",
        allergies: "Nüsse",
        verifiedEmail: true,
      },
      {
        userId: 6,
        name: "Peter Graf",
        status: "declined",
        invitedProgramItemIds: [1, 2, 3],
        attendingItemIds: [],
        declinedItemIds: [1, 2, 3],
        menuId: null,
        songWish: null,
        allergies: null,
        verifiedEmail: false,
      },
      {
        userId: 7,
        name: "Lukas Meier",
        status: "none",
        invitedProgramItemIds: [1],
        attendingItemIds: [],
        declinedItemIds: [],
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

  it("[RSVP-05][SEC-11] shows totals per program item and menu and the guest table with the admin-only allergy column", async () => {
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
    // The button is the last cell of its row, in a column of its own (UX mock `admin-rsvp`).
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(7);
    const [first, , , , , , last] = cells;
    if (!first || !last) throw new Error("the row has no first and last cell");
    expect(within(last).getByRole("link")).toHaveTextContent("Bearbeiten");
    expect(within(first).queryByRole("link")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    // The title row and the note keep their distance from the card's border.
    const card = table.closest("section");
    expect(card?.querySelector(".tight-head")).not.toBeNull();
    expect(card?.querySelector(".tight-foot")).not.toBeNull();
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
  const config = {
    deadline: "2027-05-01",
    songEnabled: true,
    perItem: true,
    companionApproval: true,
    pendingCount: 0,
    programItems: PARTS,
    menus: MENUS,
  };

  it("[RSVP-02] the admin adds a program item; the start is entered in the event's time zone", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "POST /api/admin/rsvp/program-items": () => ({
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
    user.click(screen.getByRole("button", { name: "Programmpunkt hinzufügen" }));
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

  it("[RSVP-02] deleting a program item needs a second click", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "DELETE /api/admin/rsvp/program-items/2": () => ({ status: 204 }),
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

describe("invited program items", () => {
  const config = {
    deadline: null,
    songEnabled: true,
    perItem: true,
    companionApproval: true,
    pendingCount: 0,
    programItems: PARTS,
    menus: [],
  };
  const invitation = (changes: Record<string, unknown> = {}) => ({
    id: 1,
    guestName: "Anna Muster",
    note: null,
    status: "active",
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
    programItemIds: [1, 2],
    userId: 41,
    removesGuest: false,
    ...changes,
  });

  it("[RSVP-02] a batch of invitations is created for the chosen program items, all by default", async () => {
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
    for (const programItem of ["Trauung", "Apéro", "Dinner"]) {
      expect(within(group).getByRole("button", { name: programItem })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    user.click(within(group).getByRole("button", { name: "Dinner" }));
    user.click(screen.getByRole("button", { name: "1 Einladung erstellen" }));
    await screen.findByRole("heading", { name: "1 Einladung erstellt" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      guests: [{ name: "Anna Muster" }],
      programItemIds: [1, 2],
    });
  });

  it("[RSVP-02] the program items of an invitation are changed per row", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [invitation()] } }),
      "PUT /api/admin/invitations/1/program items": () => ({
        status: 200,
        body: invitation({ programItemIds: [1, 2, 3] }),
      }),
    });
    renderAt("/admin/invitations");
    const chip = await screen.findByRole("button", { name: "Dinner: Anna Muster" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    user.click(chip);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ programItemIds: [1, 2, 3] });
  });

  it("[RSVP-02] the account panel of a promoted guest chooses the program items, also for an account created for an invitation", async () => {
    const account = (changes: Record<string, unknown>) => ({
      ...anna,
      status: "active",
      vipAssignment: "admin_promotion",
      groups: [],
      invitedProgramItemIds: [1, 3],
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
      "PUT /api/admin/users/1/program items": () => ({
        status: 200,
        body: { programItemIds: [1, 2, 3] },
      }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "Konto Oma bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    await within(panel).findByText("Eingeladen zu");
    user.click(await within(panel).findByRole("button", { name: "Apéro" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ programItemIds: [1, 2, 3] });
    expect(within(panel).getByText(/vip ohne Einladung/)).toBeInTheDocument();
  });

  it("[RSVP-02] the account panel shows the invited program items of every account with vip, also with staff or admin", async () => {
    const account = (changes: Record<string, unknown>) => ({
      ...anna,
      status: "active",
      vipAssignment: "admin_promotion",
      groups: [],
      invitedProgramItemIds: [1],
      ...changes,
    });
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            account({ id: 1, username: "lea", displayName: "Lea", roles: ["staff", "vip"] }),
            account({ id: 2, username: "max", displayName: "Max", roles: ["admin", "vip"] }),
            account({
              id: 3,
              username: "tom",
              displayName: "Tom",
              roles: ["admin", "staff", "vip"],
            }),
            account({ id: 4, username: "ida", displayName: "Ida", roles: ["admin"] }),
          ],
        },
      }),
    });
    renderAt("/admin/users");
    for (const name of ["Lea", "Max", "Tom"]) {
      user.click(await screen.findByRole("button", { name: `Konto ${name} bearbeiten` }));
      const panel = await screen.findByRole("dialog");
      await within(panel).findByText("Eingeladen zu");
      expect(await within(panel).findByRole("button", { name: "Trauung" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(panel).getByRole("button", { name: "Dinner" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      user.click(within(panel).getByRole("button", { name: "Schliessen" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    }
    // Without vip there is nothing to invite to.
    user.click(await screen.findByRole("button", { name: "Konto Ida bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByText("Eingeladen zu")).not.toBeInTheDocument();
  });
});

describe("revoking vip (7.4.1, decided 2026-11-11)", () => {
  it("[RSVP-02][SEC-11] revoking vip needs a second click, because the RSVP is deleted with it", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            {
              ...anna,
              id: 1,
              username: "oma",
              displayName: "Oma",
              roles: ["vip", "staff"],
              status: "active",
              vipAssignment: "admin_promotion",
              groups: [],
              invitedProgramItemIds: [1],
            },
          ],
        },
      }),
      "PUT /api/admin/users/1/roles": () => ({ status: 200, body: anna }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "vip für Oma" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/Oma verliert die Rolle vip/);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    // Cancelling changes nothing.
    user.click(within(confirm).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    user.click(screen.getByRole("button", { name: "vip für Oma" }));
    user.click(await screen.findByRole("button", { name: "vip entziehen" }));
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ roles: ["staff"] });
    });
  });
});

describe("Übersicht", () => {
  const overview = {
    deadline: null,
    songEnabled: true,
    perItem: true,
    companionApproval: true,
    programItems: PARTS,
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
            { action: "rsvp.program_item.delete", createdAt: ago(60 * 60), count: 1, name: null },
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
      expect.stringMatching(/^Ein Programmpunkt wurde gelöscht/),
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
        body: {
          deadline: null,
          songEnabled: true,
          perItem: true,
          companionApproval: true,
          pendingCount: 0,
          programItems: PARTS,
          menus: MENUS,
        },
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
          perItem: true,
          companionApproval: true,
          programItems: PARTS,
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

describe("one answer per person (RSVP-11, 7.4.2)", () => {
  const approvedMia = {
    id: 7,
    name: "Mia Huber",
    note: null,
    status: "approved",
    attendingItemIds: [] as number[],
    declinedItemIds: [] as number[],
    menuId: null,
    allergies: null,
  };

  it("[RSVP-11] step 1 asks once per person and the answer is the same for every program item", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ perItem: false, companionApproval: false, companions: [approvedMia] }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({ perItem: false, answer: answered([]), companions: [approvedMia] }),
      }),
    });
    renderAt("/rsvp");
    await screen.findByRole("heading", { name: "Bist du dabei, Erika?" });
    expect(screen.getByText(/Sag uns, ob du kommst/)).toBeInTheDocument();
    // The program items are listed, but nobody is asked per program item.
    expect(screen.getAllByText("Trauung · Apéro · Dinner")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Trauung: Dabei" })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Weiter" });
    expect(next).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Nein" }));
    expect(next).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Mia Huber: Nein" }));
    // Everybody declines: the wizard goes straight to sending.
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      attendance: [
        { programItemId: 1, attending: false },
        { programItemId: 2, attending: false },
        { programItemId: 3, attending: false },
      ],
      companions: [
        {
          companionId: 7,
          attendance: [
            { programItemId: 1, attending: false },
            { programItemId: 2, attending: false },
            { programItemId: 3, attending: false },
          ],
        },
      ],
    });
  });

  it("[RSVP-11] a yes answers every program item; an earlier mixed answer is shown as a yes", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ perItem: false, answer: answered([1, 3], { menuId: 1 }) }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({ perItem: false, answer: answered([1, 2, 3], { menuId: 1 }) }),
      }),
    });
    renderAt("/rsvp");
    // The summary shows the person as attending every program item.
    expect(await screen.findAllByText("Dabei")).toHaveLength(3);
    user.click(screen.getByRole("button", { name: "Ändern" }));
    const yes = await screen.findByRole("button", { name: "Ja" });
    expect(yes).toHaveAttribute("aria-pressed", "true");
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Essen & Allergien" });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      attendance: [
        { programItemId: 1, attending: true },
        { programItemId: 2, attending: true },
        { programItemId: 3, attending: true },
      ],
      menuId: 1,
    });
  });

  it("[RSVP-11][RSVP-12] the admin switches both settings; switching approval off names the requests it approves", async () => {
    const config = (changes: Record<string, unknown>) => ({
      status: 200,
      body: {
        deadline: null,
        songEnabled: true,
        perItem: true,
        companionApproval: true,
        pendingCount: 3,
        programItems: PARTS,
        menus: MENUS,
        ...changes,
      },
    });
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => config({}),
      "PUT /api/admin/rsvp/per-item": () => ({ status: 204 }),
      "PUT /api/admin/rsvp/companion-approval": () => ({ status: 200, body: { approved: 3 } }),
    });
    renderAt("/admin/settings");
    const perItem = await screen.findByRole("switch", { name: "Pro Programmpunkt zusagen" });
    expect(perItem).toHaveAttribute("aria-checked", "true");
    user.click(perItem);
    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith("/per-item") && c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.path.endsWith("/per-item"))?.body).toEqual({ enabled: false });

    // With requests waiting, switching the approval off asks first and names their number.
    user.click(screen.getByRole("switch", { name: "Begleitpersonen bestätigen" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/3 offene Anfragen werden/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/companion-approval"))).toBe(false);
    user.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    user.click(screen.getByRole("switch", { name: "Begleitpersonen bestätigen" }));
    user.click(await screen.findByRole("button", { name: "Ausschalten und annehmen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith("/companion-approval"))).toBe(true);
    });
    expect(calls.find((c) => c.path.endsWith("/companion-approval"))?.body).toEqual({
      enabled: false,
    });
  });

  it("[RSVP-12] without waiting requests the approval switches off at once", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: false,
          companionApproval: true,
          pendingCount: 0,
          programItems: PARTS,
          menus: MENUS,
        },
      }),
      "PUT /api/admin/rsvp/companion-approval": () => ({ status: 200, body: { approved: 0 } }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("switch", { name: "Begleitpersonen bestätigen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
