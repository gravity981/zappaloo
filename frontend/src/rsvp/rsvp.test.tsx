import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, hold, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The value, which the test expects to exist. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const guest = { ...anna, displayName: "Erika" };
const asGuest = { status: 200, body: { user: guest, csrfToken: "csrf-1" } };
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-9" } };

const PARTS = [
  {
    id: 1,
    name: "Trauung",
    shortCode: null,
    hasMeal: false,
    activities: [
      {
        id: 1,
        name: "Trauung",
        startsAt: "2027-06-12T12:00:00.000Z",
        endsAt: null,
        placeId: 1,
        place: "Kirche",
      },
    ],
  },
  {
    id: 2,
    name: "Apéro",
    shortCode: null,
    hasMeal: false,
    activities: [
      {
        id: 2,
        name: "Apéro",
        startsAt: "2027-06-12T13:30:00.000Z",
        endsAt: null,
        placeId: null,
        place: null,
      },
    ],
  },
  {
    id: 3,
    name: "Dinner",
    shortCode: null,
    hasMeal: true,
    activities: [
      {
        id: 3,
        name: "Dinner",
        startsAt: "2027-06-12T16:30:00.000Z",
        endsAt: null,
        placeId: 2,
        place: "Linde",
      },
    ],
  },
];
/** A place of Inhalte the program item form can choose (CNT-07). */
const PLACE_SAAL = { id: 7, name: "Saal", address: null, mapsUrl: null, mapImageId: null };
const MENUS = [
  { id: 1, name: "Fleisch", forChildren: false, shortCode: null },
  { id: 2, name: "Vegetarisch", forChildren: false, shortCode: null },
  { id: 3, name: "Kindermenü", forChildren: true, shortCode: null },
];

/** What `GET /api/rsvp` answers. */
function state(changes: Record<string, unknown> = {}) {
  return {
    name: "Erika",
    deadline: "2027-05-01",
    closed: false,
    songEnabled: true,
    perItem: true,
    personType: "adult",
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
  remarks: null,
  songWish: null,
  answeredAt: "2027-01-01T10:00:00.000Z",
  ...extra,
});

describe("the RSVP wizard", () => {
  it("[RSVP-20] the main invitee adds Sonstiges/Anmerkungen below the allergies; it is sent and only named in the summary", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({ answer: answered([1], { remarks: "Wir kommen mit dem Zug." }) }),
      }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Trauung: Dabei" }));
    user.click(screen.getByRole("button", { name: "Apéro: Nicht dabei" }));
    user.click(screen.getByRole("button", { name: "Dinner: Nicht dabei" }));
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Essen & Allergien" });
    const field = screen.getByLabelText("Sonstiges/Anmerkungen (optional)");
    expect(field).toHaveAttribute("maxlength", "500");
    expect(screen.getByText("Höchstens 500 Zeichen.")).toBeInTheDocument();
    user.type(field, "Wir kommen mit dem Zug.");
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));
    await screen.findByRole("heading", { name: /Danke, Erika/ });
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      remarks: "Wir kommen mit dem Zug.",
    });
    // The summary names the remarks without repeating them.
    expect(screen.getByText(/Anmerkungen angegeben/)).toBeInTheDocument();
    expect(screen.queryByText(/mit dem Zug/)).not.toBeInTheDocument();
  });

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
      remarks: null,
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
      remarks: null,
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
      "Die Frist für die Anmeldung ist vorbei.",
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
    expect(screen.queryByRole("link", { name: "Anmeldung" })).not.toBeInTheDocument();
  });

  it("[RSVP-01] guests find the RSVP in the menu; others are sent away", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
    });
    renderAt("/");
    // The RSVP is a card on the start page (UX mock home).
    expect(await screen.findByRole("link", { name: "Ansehen oder ändern" })).toHaveAttribute(
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

describe("Anmeldungen", () => {
  const overview = {
    deadline: "2027-05-01",
    songEnabled: true,
    perItem: true,
    personType: "adult",
    companionApproval: true,
    programItems: PARTS,
    menus: MENUS,
    totals: [
      { programItemId: 1, yes: 2, no: 1, yesByType: { adult: 2, child: 0 } },
      { programItemId: 2, yes: 1, no: 2, yesByType: { adult: 1, child: 0 } },
      { programItemId: 3, yes: 2, no: 1, yesByType: { adult: 2, child: 0 } },
    ],
    personTotals: { yes: 2, no: 1, yesByType: { adult: 2, child: 0 } },
    menuTotals: [
      { menuId: 1, count: 1, childCount: 0 },
      { menuId: 2, count: 1, childCount: 0 },
    ],
    guests: [
      {
        userId: 5,
        personType: "adult",
        name: "Erika Huber",
        status: "attending",
        invitedProgramItemIds: [1, 2, 3],
        attendingItemIds: [1, 3],
        declinedItemIds: [2],
        menuId: 2,
        remarks: null,
        songWish: "ABBA",
        allergies: "Nüsse",
        verifiedEmail: true,
        emailState: "verified",
      },
      {
        userId: 6,
        personType: "adult",
        name: "Peter Graf",
        status: "declined",
        invitedProgramItemIds: [1, 2, 3],
        attendingItemIds: [],
        declinedItemIds: [1, 2, 3],
        menuId: null,
        remarks: null,
        songWish: null,
        allergies: null,
        verifiedEmail: false,
        emailState: "none",
      },
      {
        userId: 7,
        personType: "adult",
        name: "Lukas Meier",
        status: "none",
        invitedProgramItemIds: [1],
        attendingItemIds: [],
        declinedItemIds: [],
        menuId: null,
        remarks: null,
        songWish: null,
        allergies: null,
        verifiedEmail: true,
        emailState: "verified",
      },
    ],
    companions: [],
    pendingCount: 0,
    answered: 2,
    total: 3,
    reminderCount: 1,
  };

  it("[RSVP-22] the table shows next to the status whether the email address is confirmed, open or missing", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          ...overview,
          guests: overview.guests.map((g, i) => ({
            ...g,
            emailState: (["verified", "open", "none"] as const)[i],
          })),
          companions: [
            {
              id: 3,
              hostUserId: 5,
              hostName: "Erika Huber",
              name: "Mia Huber",
              note: null,
              status: "approved",
              personType: "child",
              attendingItemIds: [1],
              declinedItemIds: [],
              menuId: null,
              allergies: null,
            },
          ],
        },
      }),
    });
    renderAt("/admin/rsvp");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "E-Mail" })).toBeInTheDocument();
    const mail = (name: RegExp) => {
      const row = within(table)
        .getAllByRole("row")
        .find((r) => name.test(r.querySelector("b")?.textContent ?? ""));
      return within(must(row)).getAllByRole("cell")[3];
    };
    expect(within(must(mail(/Erika Huber/))).getByText("bestätigt")).toHaveClass("tag", "ok");
    expect(within(must(mail(/Peter Graf/))).getByText("offen")).toHaveClass("tag", "warn");
    expect(must(mail(/Lukas Meier/))).toHaveTextContent("–");
    // An accompanying person has no address of their own.
    expect(must(mail(/Mia Huber/))).toHaveTextContent("–");
  });

  it("[RSVP-23] a Kürzel of a program item or a menu replaces its first letter in the tables", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          ...overview,
          programItems: PARTS.map((p) => (p.id === 1 ? { ...p, shortCode: "Tr" } : p)),
          menus: MENUS.map((m) => (m.id === 2 ? { ...m, shortCode: "Vt" } : m)),
        },
      }),
    });
    renderAt("/admin/rsvp");
    const row = within(await screen.findByRole("table")).getByRole("row", { name: /Erika Huber/ });
    expect(within(row).getByText("Tr")).toHaveAttribute("title", "Trauung");
    expect(within(row).getByText("Vt")).toHaveAttribute("title", "Vegetarisch");
    expect(within(row).queryByText("T")).not.toBeInTheDocument();
  });

  it("[RSVP-19] the menu totals are kept per list, and a child's adults' menu counts as Erwachsenenmenü", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          ...overview,
          menuTotals: [
            { menuId: 1, count: 3, childCount: 1 },
            { menuId: 3, count: 2, childCount: 2 },
          ],
        },
      }),
    });
    renderAt("/admin/rsvp");
    const card = (await screen.findByText("Menüs (Dinner)")).closest("section");
    if (!card) throw new Error("no menu card");
    const rows = Array.from(card.querySelectorAll(".bar-row")).map((row) => row.textContent);
    expect(rows).toEqual(["Fleisch2", "Kindermenü2", "Erwachsenenmenü1"]);
    expect(within(card).getByText("Erwachsene")).toBeInTheDocument();
    expect(within(card).getByText("Kinder")).toBeInTheDocument();
  });

  it("[RSVP-05][SEC-11] shows totals per program item and menu and the guest table with the admin-only allergy column", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview }),
    });
    renderAt("/admin/rsvp");
    expect(await screen.findByRole("heading", { name: "Anmeldungen" })).toBeInTheDocument();
    expect(await screen.findAllByText("2 ja (2 Erwachsene) · 1 nein")).toHaveLength(2);
    expect(screen.getByText("Menüs (Dinner)")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Allergien/ })).toBeInTheDocument();
    const row = within(table).getByRole("row", { name: /Erika Huber/ });
    // Program items, menu and type are short forms with the full name as the tooltip (RSVP-23).
    expect(within(row).getByText("T")).toHaveAttribute("title", "Trauung");
    expect(within(row).getByText("D")).toHaveAttribute("title", "Dinner");
    expect(within(row).getByText("V")).toHaveAttribute("title", "Vegetarisch");
    expect(within(row).getByText("E")).toHaveAttribute("title", "Erwachsen");
    expect(within(row).getByText("Nüsse")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Anmerkungen/ })).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Bearbeiten: Erika Huber" })).toHaveAttribute(
      "href",
      "/admin/rsvp/guests/5",
    );
    // The button is the last cell of its row, in a column of its own (UX mock `admin-rsvp`).
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(10);
    const [first, , , , , , , , , last] = cells;
    if (!first || !last) throw new Error("the row has no first and last cell");
    expect(within(last).getByRole("link")).toHaveTextContent("Bearbeiten");
    expect(within(first).queryByRole("link")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(10);
    // The column Typ and the totals by type (RSVP-15).
    expect(within(table).getByRole("columnheader", { name: "Typ" })).toBeInTheDocument();
    expect(within(row).getByText("E")).toHaveAttribute("title", "Erwachsen");
    // The lock and the title alone, no "nur Admins" (decided 2026-11-12).
    expect(within(table).getByRole("columnheader", { name: /^🔒 Allergien$/ })).toBeInTheDocument();
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

describe("Einstellungen › Anmeldung", () => {
  const config = {
    deadline: "2027-05-01",
    songEnabled: true,
    perItem: true,
    personType: "adult",
    companionApproval: true,
    pendingCount: 0,
    programItems: PARTS,
    menus: MENUS,
  };

  it("[RSVP-02] the admin adds a program item; the start is entered in the event's time zone", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/content": () => ({
        status: 200,
        body: {
          startMarkdown: "",
          pages: [],
          places: [PLACE_SAAL],
          start: { heroImageId: null, heroAlt: null, countdown: true },
        },
      }),
      "POST /api/admin/rsvp/program-items": () => ({
        status: 201,
        body: {
          id: 4,
          name: "Party",
          shortCode: null,
          hasMeal: false,
          activities: [
            {
              id: 4,
              name: "Party",
              startsAt: "2027-06-12T20:00:00.000Z",
              endsAt: null,
              placeId: 7,
              place: "Saal",
            },
          ],
        },
      }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByRole("button", { name: "Bearbeiten: Dinner" })).toBeInTheDocument();
    expect(screen.getByText("Essen")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Programmpunkt hinzufügen" }));
    const start = await screen.findByLabelText("Beginn");
    const form = within(start.closest("form") as HTMLElement);
    user.type(form.getByLabelText("Name"), "Party");
    user.type(form.getByLabelText("Name der Aktivität"), "Tanzen");
    user.type(start, "12.06.2027 22:00");
    user.type(form.getByLabelText("Ort (optional)"), "7");
    user.click(form.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    // 22:00 in Zurich (summer time) is 20:00 UTC.
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Party",
      shortCode: null,
      hasMeal: false,
      activities: [
        { name: "Tanzen", startsAt: "2027-06-12T20:00:00.000Z", endsAt: null, placeId: 7 },
      ],
    });
  });

  /** Dinner with two activities, Apéro with one. */
  const withActivities = {
    ...config,
    programItems: [
      {
        id: 2,
        name: "Apéro",
        shortCode: null,
        hasMeal: false,
        activities: [PARTS[1]?.activities[0]],
      },
      {
        id: 3,
        name: "Dinner",
        shortCode: null,
        hasMeal: true,
        activities: [
          {
            id: 31,
            name: "Essen",
            startsAt: "2027-06-12T16:30:00.000Z",
            endsAt: null,
            placeId: null,
            place: null,
          },
          {
            id: 32,
            name: "Paar-Quiz",
            startsAt: "2027-06-12T18:30:00.000Z",
            endsAt: null,
            placeId: null,
            place: null,
          },
        ],
      },
    ],
  };
  const contentBody = {
    startMarkdown: "",
    pages: [],
    places: [PLACE_SAAL],
    start: { heroImageId: null, heroAlt: null, countdown: true },
  };

  it("[RSVP-17] the activities are listed under their program item; the last one of an item cannot be deleted", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: withActivities }),
      "GET /api/content": () => ({ status: 200, body: contentBody }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByText("Paar-Quiz")).toBeInTheDocument();
    expect(screen.getByText("Essen", { selector: "b" })).toBeInTheDocument();
    // Apéro has one activity: it stays, and the hint says what to do instead.
    expect(screen.getByRole("button", { name: "Aktivität löschen: Apéro" })).toBeDisabled();
    expect(screen.getByText(/Die letzte Aktivität lässt sich nicht löschen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aktivität löschen: Paar-Quiz" })).toBeEnabled();
  });

  it("[RSVP-17] the admin adds an activity under a program item", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: withActivities }),
      "GET /api/content": () => ({ status: 200, body: contentBody }),
      "POST /api/admin/rsvp/program-items/3/activities": () => ({
        status: 201,
        body: { id: 33, name: "Dessert", startsAt: "", endsAt: null, placeId: null, place: null },
      }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("button", { name: "Aktivität hinzufügen: Dinner" }));
    const start = await screen.findByLabelText("Beginn");
    const form = within(start.closest("form") as HTMLElement);
    user.type(form.getByLabelText("Name der Aktivität"), "Dessert");
    user.type(start, "12.06.2027 20:00");
    user.click(form.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Dessert",
      startsAt: "2027-06-12T18:00:00.000Z",
      endsAt: null,
      placeId: null,
    });
  });

  it("[RSVP-17] the activities of a program item are listed chronologically, the first one at the top", async () => {
    // The server answers in the wrong order on purpose: the card does not depend on it.
    const [first, second] = withActivities.programItems[1]?.activities ?? [];
    const unsorted = {
      ...withActivities,
      programItems: [
        { ...withActivities.programItems[1], activities: [second, first] },
        withActivities.programItems[0],
      ],
    };
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: unsorted }),
      "GET /api/content": () => ({ status: 200, body: contentBody }),
    });
    renderAt("/admin/settings");
    await screen.findByText("Paar-Quiz");
    const names = screen
      .getAllByRole("button", { name: /^Aktivität bearbeiten: / })
      .map((button) => button.getAttribute("aria-label"));
    // Apéro (13:30) comes before Dinner (16:30), and Essen before Paar-Quiz within Dinner.
    expect(names).toEqual([
      "Aktivität bearbeiten: Apéro",
      "Aktivität bearbeiten: Essen",
      "Aktivität bearbeiten: Paar-Quiz",
    ]);
  });

  it("[RSVP-17] date and time of an activity are written day.month.year and in 24-hour format", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: withActivities }),
      "GET /api/content": () => ({ status: 200, body: contentBody }),
    });
    renderAt("/admin/settings");
    // Paar-Quiz starts at 20:30 in Zurich (summer time): shown as one text, day first.
    user.click(await screen.findByRole("button", { name: "Aktivität bearbeiten: Paar-Quiz" }));
    const start = await screen.findByLabelText("Beginn");
    expect(start).toHaveValue("12.06.2027 20:30");
    expect(start).toHaveAttribute("placeholder", "TT.MM.JJJJ HH:MM");
    // 13.06. is not 06.13.: a month first, or AM/PM, is not a date here.
    user.type(start, "06.13.2027 8:30 PM");
    expect((start as HTMLInputElement).validity.customError).toBe(true);
    user.type(start, "13.06.2027 20:30");
    expect((start as HTMLInputElement).validity.customError).toBe(false);
  });

  it("[RSVP-17] the admin changes and deletes an activity", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: withActivities }),
      "GET /api/content": () => ({ status: 200, body: contentBody }),
      "PATCH /api/admin/rsvp/activities/32": () => ({
        status: 200,
        body: withActivities.programItems[1]?.activities[1],
      }),
      "DELETE /api/admin/rsvp/activities/31": () => ({ status: 204 }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("button", { name: "Aktivität bearbeiten: Paar-Quiz" }));
    const name = await screen.findByDisplayValue("Paar-Quiz");
    user.clear(name);
    user.type(name, "Quiz");
    const form = within(name.closest("form") as HTMLElement);
    user.click(form.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      name: "Quiz",
      startsAt: "2027-06-12T18:30:00.000Z",
      endsAt: null,
      placeId: null,
    });
    user.click(await screen.findByRole("button", { name: "Aktivität löschen: Essen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "DELETE")).toBe(true);
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
    user.type(await screen.findByLabelText(/Frist \(letzter Tag\)/), "15.05.2027");
    user.click(screen.getByRole("button", { name: "Frist festlegen" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ deadline: "2027-05-15" });
    hold(screen.getByRole("button", { name: "Frist entfernen" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PUT")[1]?.body).toEqual({ deadline: null });
  });

  it("[RSVP-04] the deadline is written day.month.year and a date that does not exist is refused", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: { ...config, deadline: "2027-05-01" },
      }),
      "PUT /api/admin/rsvp/deadline": () => ({ status: 200, body: config }),
    });
    renderAt("/admin/settings");
    // The date as set, day first, whatever the browser's locale.
    const field = await screen.findByLabelText(/Frist \(letzter Tag\)/);
    expect(field).toHaveValue("01.05.2027");
    expect(field).toHaveAttribute("placeholder", "TT.MM.JJJJ");
    user.clear(field);
    user.type(field, "31.04.2027");
    expect(field).toBeInvalid();
    user.click(screen.getByRole("button", { name: "Frist festlegen" }));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    user.clear(field);
    user.type(field, "30.04.2027");
    expect(field).toBeValid();
    user.click(screen.getByRole("button", { name: "Frist festlegen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ deadline: "2027-04-30" });
  });

  it("[RSVP-23] the admin sets the Kürzel of a program item and of a menu; the default is the first letter", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "PATCH /api/admin/rsvp/program-items/1": () => ({ status: 200, body: PARTS[0] }),
      "PATCH /api/admin/rsvp/menus/1": () => ({ status: 200, body: MENUS[0] }),
    });
    renderAt("/admin/settings");
    // The cards show the Kürzel next to the name: by default the first letter.
    const item = await screen.findByRole("button", { name: "Bearbeiten: Trauung" });
    expect(item.closest(".card")?.querySelector(".tag.line")).toHaveTextContent("T");
    user.click(item);
    const code = await screen.findByLabelText("Kürzel");
    expect(code).toHaveAttribute("maxlength", "2");
    expect(code).toHaveAttribute("placeholder", "T");
    user.type(code, "Tr");
    user.click(
      within(code.closest("form") as HTMLElement).getByRole("button", { name: "Speichern" }),
    );
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/rsvp/program-items/1")).toBe(true);
    });
    expect(calls.find((c) => c.path === "/api/admin/rsvp/program-items/1")?.body).toMatchObject({
      shortCode: "Tr",
    });

    user.click(await screen.findByRole("button", { name: "Bearbeiten: Fleisch" }));
    const menuCode = await screen.findByLabelText("Kürzel");
    expect(menuCode).toHaveAttribute("placeholder", "F");
    user.type(menuCode, "Fl");
    user.click(
      within(menuCode.closest("form") as HTMLElement).getByRole("button", { name: "Speichern" }),
    );
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/rsvp/menus/1")).toBe(true);
    });
    expect(calls.find((c) => c.path === "/api/admin/rsvp/menus/1")?.body).toEqual({
      name: "Fleisch",
      shortCode: "Fl",
    });
  });

  it("[RSVP-03] the admin adds a menu option to the one list", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "POST /api/admin/rsvp/menus": () => ({
        status: 201,
        body: { id: 3, name: "Vegan", forChildren: false, shortCode: null },
      }),
    });
    renderAt("/admin/settings");
    const add = await screen.findByRole("button", { name: "Menü hinzufügen" });
    expect(add).toBeDisabled();
    user.type(screen.getByLabelText("Bezeichnung des Menüs"), "Vegan");
    user.click(add);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Vegan",
      forChildren: false,
    });
  });

  it("[RSVP-19] the admin keeps a second list of children's menus", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          ...config,
          menus: [
            { id: 1, name: "Fleisch", forChildren: false, shortCode: null },
            { id: 3, name: "Kindermenü", forChildren: true, shortCode: null },
          ],
        },
      }),
      "POST /api/admin/rsvp/menus": () => ({
        status: 201,
        body: { id: 4, name: "Pasta", forChildren: true, shortCode: null },
      }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByText("Kindermenüs", { selector: "b" })).toBeInTheDocument();
    // Each menu stands in its own list.
    expect(screen.getByText("Kindermenü", { selector: "li span" })).toBeInTheDocument();
    const add = await screen.findByRole("button", { name: "Kindermenü hinzufügen" });
    user.type(screen.getByLabelText("Bezeichnung des Kindermenüs"), "Pasta");
    user.click(add);
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Pasta",
      forChildren: true,
    });
  });
});

describe("invited program items", () => {
  const config = {
    deadline: null,
    songEnabled: true,
    perItem: true,
    personType: "adult",
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
    personType: "adult",
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
      personType: "adult",
    });
  });

  it("[RSVP-02] the invitation list shows the invited program items as read-only letters", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({ status: 200, body: config }),
      "GET /api/admin/invitations": () => ({
        status: 200,
        body: { invitations: [invitation({ programItemIds: [1, 3] })] },
      }),
    });
    renderAt("/admin/invitations");
    // Trauung and Dinner: T D (their Kürzel), with the names as the title. Apéro is not invited.
    const letters = await screen.findByText("T D");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Gast",
      "Programmpunkte",
      "Typ",
      "Status",
      "Aktionen",
    ]);
    expect(letters).toHaveAttribute("title", "Trauung, Dinner");
    // Nothing to click: the program items are changed in the account panel.
    expect(screen.queryByRole("button", { name: "Dinner: Anna Muster" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("[RSVP-02] the account panel of a promoted guest chooses the program items, also for an account created for an invitation", async () => {
    const account = (changes: Record<string, unknown>) => ({
      ...anna,
      status: "active",
      vipAssignment: "admin_promotion",
      personType: "adult",
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
              personType: "adult",
            }),
          ],
        },
      }),
      "PUT /api/admin/users/1/program-items": () => ({
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
      personType: "adult",
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
              personType: "adult",
              groups: [],
              invitedProgramItemIds: [1],
            },
          ],
        },
      }),
      "PUT /api/admin/users/1/roles": () => ({ status: 200, body: anna }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: "Konto Oma bearbeiten" }));
    const panel = await screen.findByRole("dialog");
    user.click(within(panel).getByRole("button", { name: "vip" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/Oma verliert die Rolle vip/);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    // Cancelling changes nothing.
    user.click(within(confirm).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    user.click(within(panel).getByRole("button", { name: "vip" }));
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
    personType: "adult",
    companionApproval: true,
    programItems: PARTS,
    menus: MENUS,
    totals: [],
    personTotals: { yes: 0, no: 0, yesByType: { adult: 0, child: 0 } },
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
      expect.stringMatching(/^Erika Huber hat die Anmeldung abgegeben/),
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
          personType: "adult",
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
          personType: "adult",
          companionApproval: true,
          programItems: PARTS,
          menus: MENUS,
          totals: [],
          personTotals: { yes: 0, no: 0, yesByType: { adult: 0, child: 0 } },
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

describe("activities in the wizard (RSVP-16)", () => {
  /** Trauung with two activities, then Apéro. */
  const multi = [
    {
      ...PARTS[0],
      activities: [
        {
          id: 11,
          name: "Eintreffen",
          startsAt: "2027-06-12T11:30:00.000Z",
          endsAt: null,
          placeId: null,
          place: null,
        },
        { ...PARTS[0]?.activities[0], id: 12 },
      ],
    },
    PARTS[1],
  ];

  it("[RSVP-16] each program item lists its activities with their start times, per program item and in the summary", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ programItems: multi, answer: answered([1, 2]) }),
      }),
    });
    renderAt("/rsvp");
    // The summary: a small line below each program item's name (times in the event's time zone).
    expect(await screen.findByText("Eintreffen 13:30, Trauung 14:00")).toBeInTheDocument();
    expect(screen.getByText("Apéro 15:30")).toBeInTheDocument();
    // Step 1, one yes or no per program item: the same lines.
    user.click(screen.getByRole("button", { name: "Ändern" }));
    expect(await screen.findByText("Eintreffen 13:30, Trauung 14:00")).toBeInTheDocument();
    expect(screen.getByText("Apéro 15:30")).toBeInTheDocument();
  });

  it("[RSVP-16] with one answer for all the program items are listed with their activities", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ perItem: false, programItems: multi, answer: null }),
      }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByText("Trauung – Eintreffen 13:30, Trauung 14:00"),
    ).toBeInTheDocument();
    expect(screen.getByText("Apéro – Apéro 15:30")).toBeInTheDocument();
  });
});

describe("one answer per person (RSVP-11, 7.4.2)", () => {
  const approvedMia = {
    id: 7,
    name: "Mia Huber",
    personType: "adult",
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
        body: state({
          perItem: false,
          personType: "adult",
          companionApproval: false,
          companions: [approvedMia],
        }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({
          perItem: false,
          personType: "adult",
          answer: answered([]),
          companions: [approvedMia],
        }),
      }),
    });
    renderAt("/rsvp");
    await screen.findByRole("heading", { name: "Bist du dabei, Erika?" });
    expect(screen.getByText(/Sag uns, ob du kommst/)).toBeInTheDocument();
    // The program items are listed, but nobody is asked per program item.
    expect(screen.getAllByText("Trauung – Trauung 14:00")).toHaveLength(2);
    expect(screen.getAllByText("Dinner – Dinner 18:30")).toHaveLength(2);
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
        body: state({
          perItem: false,
          personType: "adult",
          answer: answered([1, 3], { menuId: 1 }),
        }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({
          perItem: false,
          personType: "adult",
          answer: answered([1, 2, 3], { menuId: 1 }),
        }),
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
        personType: "adult",
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
      "GET /api/admin/rsvp/pending": () => ({
        status: 200,
        body: { pendingCount: 3, companionApproval: true },
      }),
    });
    const badgeLoads = () => calls.filter((c) => c.path === "/api/admin/rsvp/pending").length;
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
    const loadsBefore = badgeLoads();
    user.click(await screen.findByRole("button", { name: "Ausschalten und annehmen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith("/companion-approval"))).toBe(true);
    });
    // The badge of the navigation asks again: the requests are approved now.
    await waitFor(() => {
      expect(badgeLoads()).toBeGreaterThan(loadsBefore);
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
          personType: "adult",
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

describe("person types (RSVP-13, RSVP-14, RSVP-15)", () => {
  const overviewBase = {
    deadline: null,
    songEnabled: true,
    perItem: true,
    companionApproval: false,
    programItems: PARTS,
    menus: MENUS,
    personTotals: { yes: 0, no: 0, yesByType: { adult: 0, child: 0 } },
    menuTotals: [],
    guests: [],
    companions: [],
    pendingCount: 0,
    answered: 0,
    total: 0,
    reminderCount: 0,
  };

  it("[RSVP-15] the totals name the types that are there", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          ...overviewBase,
          totals: [
            { programItemId: 1, yes: 42, no: 3, yesByType: { adult: 37, child: 5 } },
            { programItemId: 2, yes: 2, no: 0, yesByType: { adult: 1, child: 1 } },
            { programItemId: 3, yes: 0, no: 4, yesByType: { adult: 0, child: 0 } },
          ],
        },
      }),
    });
    renderAt("/admin/rsvp");
    expect(await screen.findByText("42 ja (37 Erwachsene, 5 Kinder) · 3 nein")).toBeInTheDocument();
    // One of a type is worded in the singular.
    expect(screen.getByText("2 ja (1 erwachsene Person, 1 Kind) · 0 nein")).toBeInTheDocument();
    expect(screen.getByText("0 ja · 4 nein")).toBeInTheDocument();
    // The note of an empty guest table spans all ten columns.
    expect(screen.getByText("Noch keine Gäste.").closest("td")).toHaveAttribute("colspan", "10");
    expect(screen.getByText("Pro Programmpunkt")).toBeInTheDocument();
  });

  it("[RSVP-15] with one answer for everyone the overview is one bar without a name", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 200,
        body: {
          ...overviewBase,
          perItem: false,
          // Guests are invited to different program items, so no program item counts everyone.
          totals: [
            { programItemId: 1, yes: 30, no: 1, yesByType: { adult: 28, child: 2 } },
            { programItemId: 2, yes: 42, no: 3, yesByType: { adult: 37, child: 5 } },
            { programItemId: 3, yes: 20, no: 2, yesByType: { adult: 20, child: 0 } },
          ],
          personTotals: { yes: 45, no: 4, yesByType: { adult: 39, child: 6 } },
        },
      }),
    });
    renderAt("/admin/rsvp");
    // The bar counts persons: whoever attends anything, whoever declined everything.
    expect(await screen.findByText("45 ja (39 Erwachsene, 6 Kinder) · 4 nein")).toBeInTheDocument();
    expect(document.querySelectorAll(".bar-row.single")).toHaveLength(1);
    expect(screen.queryByText(/^30 ja/)).not.toBeInTheDocument();
    expect(screen.getByText("Übersicht", { selector: "b" })).toBeInTheDocument();
    expect(screen.queryByText("Pro Programmpunkt")).not.toBeInTheDocument();
    expect(screen.queryByText("Trauung", { selector: ".bar-row span" })).not.toBeInTheDocument();
  });

  it("[RSVP-14][RSVP-19] a child chooses from the children's menus and must choose one", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ personType: "child", answer: answered([1, 3]) }),
      }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Ändern" }));
    await screen.findByRole("heading", { name: "Bist du dabei, Erika?" });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Essen & Allergien" });
    expect(screen.getByText("Menü (Dinner)")).toBeInTheDocument();
    // Only the children's list, and the child cannot go on without a choice.
    expect(screen.queryByRole("button", { name: "Fleisch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Kindermenü" }));
    expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
  });

  it("[RSVP-14] an adult must choose the menu before going on", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({ personType: "adult", answer: answered([1, 3]) }),
      }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Ändern" }));
    await screen.findByRole("heading", { name: "Bist du dabei, Erika?" });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Essen & Allergien" });
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
  });

  it("[RSVP-13] the admin sets the type of a batch, and the list shows it as one letter that cannot be changed", async () => {
    const invitationRow = {
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
      removesGuest: true,
      personType: "child",
    };
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: true,
          companionApproval: false,
          pendingCount: 0,
          programItems: PARTS,
          menus: [],
        },
      }),
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [invitationRow] } }),
      "POST /api/admin/invitations": () => ({
        status: 201,
        body: {
          invitations: [{ ...invitationRow, code: "K7QMX4", url: "http://x/invite/K7QMX4" }],
        },
      }),
    });
    renderAt("/admin/invitations");
    // The batch: Erwachsen is chosen by default, a click makes it Kind. There is no baby.
    const group = await screen.findByRole("group", { name: "Typ" });
    expect(within(group).getByRole("button", { name: "Erwachsen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).queryByRole("button", { name: "Baby" })).not.toBeInTheDocument();
    user.click(within(group).getByRole("button", { name: "Kind" }));
    user.type(screen.getByLabelText("Gäste (ein Name pro Zeile)"), "Mia");
    user.click(screen.getByRole("button", { name: "1 Einladung erstellen" }));
    await screen.findByRole("heading", { name: "1 Einladung erstellt" });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ personType: "child" });
    user.click(screen.getByRole("button", { name: "Fertig" }));

    // In the list: one letter, no selector.
    const letter = await screen.findByText("K");
    expect(letter).toHaveAttribute("title", "Kind");
    expect(screen.queryByRole("combobox", { name: /Typ/ })).not.toBeInTheDocument();
  });

  it("[RSVP-13] the account panel of a guest sets the type", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/config": () => ({
        status: 200,
        body: {
          deadline: null,
          songEnabled: true,
          perItem: true,
          companionApproval: false,
          pendingCount: 0,
          programItems: PARTS,
          menus: [],
        },
      }),
      "GET /api/admin/groups": () => ({ status: 200, body: { groups: [] } }),
      "GET /api/admin/users": () => ({
        status: 200,
        body: {
          users: [
            {
              ...anna,
              id: 1,
              status: "active",
              personType: "adult",
              roles: ["vip"],
              vipAssignment: "admin_promotion",
              groups: [],
              invitedProgramItemIds: [1],
            },
          ],
        },
      }),
      "PUT /api/admin/users/1/person-type": () => ({ status: 204 }),
    });
    renderAt("/admin/users");
    user.click(await screen.findByRole("button", { name: /Konto .* bearbeiten/ }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("button", { name: "Erwachsen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    user.click(within(panel).getByRole("button", { name: "Kind" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/users/1/person-type")).toBe(true);
    });
    expect(calls.find((c) => c.path.endsWith("/person-type"))?.body).toEqual({
      personType: "child",
    });
  });
});
