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

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const guest = { ...anna, displayName: "Erika" };
const asGuest = { status: 200, body: { user: guest, csrfToken: "csrf-1" } };
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-9" } };

const PARTS = [
  { id: 1, name: "Trauung", startsAt: "2027-06-12T12:00:00.000Z", place: null, hasMeal: false },
  { id: 3, name: "Dinner", startsAt: "2027-06-12T16:30:00.000Z", place: null, hasMeal: true },
];
const MENUS = [
  { id: 1, name: "Fleisch" },
  { id: 4, name: "Kindermenü" },
];

const companion = (changes: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Mia Huber",
  note: "Meine Tochter, 6 Jahre",
  status: "pending",
  attendingPartIds: [1, 3],
  menuId: 4,
  allergies: null,
  ...changes,
});

function state(changes: Record<string, unknown> = {}) {
  return {
    name: "Erika",
    deadline: "2027-05-01",
    closed: false,
    songEnabled: true,
    parts: PARTS,
    menus: MENUS,
    answer: {
      attendingPartIds: [1],
      menuId: null,
      allergies: null,
      songWish: null,
      answeredAt: "2027-01-01T10:00:00.000Z",
    },
    companions: [],
    ...changes,
  };
}

/** Opens the RSVP of a guest who has answered and goes to step 3 (companions and song). */
async function toStepThree() {
  user.click(await screen.findByRole("button", { name: "Ändern" }));
  user.click(await screen.findByRole("button", { name: "Weiter" }));
  const next = await screen.findAllByRole("button", { name: "Weiter" });
  user.click(must(next[0]));
  await screen.findByRole("heading", { name: "Begleitpersonen & Musik" });
}

describe("accompanying persons in the wizard", () => {
  it("[RSVP-08][RSVP-10] the list shows the status of each person and what the guest can do", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({
          companions: [
            companion(),
            companion({ id: 8, name: "Noah Huber", status: "approved", note: null }),
            companion({ id: 9, name: "Hans Graf", status: "rejected", note: null }),
          ],
        }),
      }),
    });
    renderAt("/rsvp");
    await toStepThree();
    const items = screen.getAllByRole("listitem");
    const row = (name: string) => must(items.find((item) => within(item).queryByText(name)));

    // Pending: change or withdraw. Approved: only the hint. Rejected: remove.
    expect(within(row("Mia Huber")).getByText("Wartet auf Bestätigung")).toBeInTheDocument();
    expect(
      within(row("Mia Huber")).getByRole("button", { name: "Bearbeiten: Mia Huber" }),
    ).toBeInTheDocument();
    expect(
      within(row("Mia Huber")).getByRole("button", { name: "Zurückziehen: Mia Huber" }),
    ).toBeInTheDocument();
    expect(within(row("Noah Huber")).getByText("Bestätigt")).toBeInTheDocument();
    expect(within(row("Noah Huber")).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(row("Hans Graf")).getByRole("button", { name: "Entfernen: Hans Graf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Teilnahme, Menü und Allergien bestätigter Personen änderst du in den Schritten 1 und 2/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Wer ein eigenes Handy hat/)).toBeInTheDocument();
  });

  it("[RSVP-08] the guest requests a person: name, note, attendance, menu and allergies", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
      "POST /api/rsvp/companions": () => ({
        status: 201,
        body: state({ companions: [companion()] }),
      }),
    });
    renderAt("/rsvp");
    await toStepThree();
    user.click(screen.getByRole("button", { name: "+ Begleitperson beantragen" }));

    // The form has the title of the flow frame.
    expect(
      await screen.findByText("Begleitperson beantragen", { selector: "b" }),
    ).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Beantragen" });
    expect(submit).toBeDisabled();
    user.type(screen.getByLabelText("Name"), "Mia Huber");
    user.type(
      screen.getByLabelText("Notiz für die Gastgeber (optional)"),
      "Meine Tochter, 6 Jahre",
    );
    user.click(screen.getByRole("button", { name: "Trauung: Dabei" }));
    user.click(screen.getByRole("button", { name: "Dinner: Dabei" }));
    // The meal part needs a menu.
    expect(submit).toBeDisabled();
    user.click(screen.getByRole("button", { name: "Mia Huber: Kindermenü" }));
    expect(submit).toBeEnabled();
    user.click(submit);

    // Back in the wizard, the new request is in the list as pending.
    expect(await screen.findByText("Wartet auf Bestätigung")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      csrf: "csrf-1",
      body: {
        name: "Mia Huber",
        note: "Meine Tochter, 6 Jahre",
        attendance: [
          { partId: 1, attending: true },
          { partId: 3, attending: true },
        ],
        menuId: 4,
      },
    });
  });

  it("[RSVP-10] a pending request is changed in the same form and withdrawn with one click", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state({ companions: [companion()] }) }),
      "PUT /api/rsvp/companions/7": () => ({
        status: 200,
        body: state({ companions: [companion({ name: "Mia Maria Huber" })] }),
      }),
      "DELETE /api/rsvp/companions/7": () => ({ status: 200, body: state() }),
    });
    renderAt("/rsvp");
    await toStepThree();
    user.click(screen.getByRole("button", { name: "Bearbeiten: Mia Huber" }));
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Mia Huber");
    expect(screen.getByLabelText("Notiz für die Gastgeber (optional)")).toHaveValue(
      "Meine Tochter, 6 Jahre",
    );
    user.type(name, "Mia Maria Huber");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Mia Maria Huber")).toBeInTheDocument();
    expect(
      calls.find((c) => c.method === "PUT" && c.path.includes("companions"))?.body,
    ).toMatchObject({
      name: "Mia Maria Huber",
      attendance: [
        { partId: 1, attending: true },
        { partId: 3, attending: true },
      ],
      menuId: 4,
    });

    user.click(screen.getByRole("button", { name: "Zurückziehen: Mia Maria Huber" }));
    await waitFor(() => {
      expect(screen.queryByText("Mia Maria Huber")).not.toBeInTheDocument();
    });
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/rsvp/companions/7")).toBe(
      true,
    );
  });

  it("[RSVP-08] what the guest typed in the steps is kept while a request is made", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state() }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Ändern" }));
    user.click(await screen.findByRole("button", { name: "Dinner: Dabei" }));
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Fleisch" }));
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "+ Begleitperson beantragen" }));
    user.click(await screen.findByRole("button", { name: "Abbrechen" }));
    // Back at step 3 with the song field of an attending guest; going back keeps the menu.
    await screen.findByRole("heading", { name: "Begleitpersonen & Musik" });
    user.click(screen.getByRole("button", { name: "Zurück" }));
    expect(await screen.findByRole("button", { name: "Fleisch" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("[RSVP-09] approved persons are answered in the steps like the guest, with their own menu and allergies", async () => {
    const noah = companion({
      id: 8,
      name: "Noah Huber",
      status: "approved",
      note: null,
      attendingPartIds: [3],
      menuId: 4,
    });
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state({ companions: [noah] }) }),
      "PUT /api/rsvp": () => ({ status: 200, body: state({ companions: [noah] }) }),
    });
    renderAt("/rsvp");
    user.click(await screen.findByRole("button", { name: "Ändern" }));
    // Step 1: a block for the approved person under the guest's own.
    expect(await screen.findByText("Noah Huber")).toBeInTheDocument();
    // The guest's own buttons come first, then Noah's.
    expect(screen.getAllByRole("group", { name: "Dinner" })).toHaveLength(2);
    user.click(must(screen.getAllByRole("button", { name: "Dinner: Nicht dabei" })[1]));
    user.click(must(screen.getAllByRole("button", { name: "Trauung: Dabei" })[1]));
    user.click(screen.getByRole("button", { name: "Weiter" }));

    // Step 2: a card for each person who attends, here only Noah (Trauung) and Erika.
    expect(await screen.findByRole("heading", { name: "Essen & Allergien" })).toBeInTheDocument();
    user.type(screen.getByLabelText("Allergien oder Unverträglichkeiten (Noah Huber)"), "Laktose");
    user.click(screen.getByRole("button", { name: "Weiter" }));
    user.click(await screen.findByRole("button", { name: "Antwort senden" }));

    await waitFor(() => {
      expect(calls.some((c) => c.method === "PUT")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      companions: [
        {
          companionId: 8,
          attendance: [
            { partId: 1, attending: true },
            { partId: 3, attending: false },
          ],
          allergies: "Laktose",
        },
      ],
    });
  });

  it("[RSVP-09] declining every part for the guest and the approved persons skips to the summary", async () => {
    const noah = companion({ id: 8, name: "Noah", status: "approved", attendingPartIds: [] });
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({
          answer: null,
          companions: [noah, companion({ id: 7, attendingPartIds: [] })],
        }),
      }),
      "PUT /api/rsvp": () => ({
        status: 200,
        body: state({
          answer: {
            attendingPartIds: [],
            menuId: null,
            allergies: null,
            songWish: null,
            answeredAt: "2027-01-02T10:00:00.000Z",
          },
          companions: [noah],
        }),
      }),
    });
    renderAt("/rsvp");
    // The guest's own buttons come first; Noah and the pending request already decline.
    const trauung = await screen.findAllByRole("button", { name: "Trauung: Nicht dabei" });
    user.click(must(trauung[0]));
    user.click(must(screen.getAllByRole("button", { name: "Dinner: Nicht dabei" })[0]));
    user.click(screen.getByRole("button", { name: "Antwort senden" }));
    expect(
      await screen.findByRole("heading", {
        name: /Schade, dass du nicht dabei sein kannst, Erika/,
      }),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      companions: [
        {
          companionId: 8,
          attendance: [
            { partId: 1, attending: false },
            { partId: 3, attending: false },
          ],
        },
        {
          companionId: 7,
          attendance: [
            { partId: 1, attending: false },
            { partId: 3, attending: false },
          ],
        },
      ],
    });
  });

  it("[RSVP-04] after the deadline the summary lists the persons without any action", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: state({
          closed: true,
          companions: [companion(), companion({ id: 8, name: "Noah", status: "approved" })],
        }),
      }),
    });
    renderAt("/rsvp");
    expect(await screen.findByText("Mia Huber")).toBeInTheDocument();
    expect(screen.getByText("Wartet auf Bestätigung")).toBeInTheDocument();
    expect(screen.getByText("Bestätigt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ändern" })).not.toBeInTheDocument();
  });

  it("[RSVP-09] in admin mode the admin renames an approved person and cannot request or withdraw", async () => {
    let name = "Noah Huber";
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp/guests/5": () => ({
        status: 200,
        body: state({
          closed: true,
          companions: [
            companion({ id: 8, name, status: "approved", note: null }),
            companion({ id: 7, name: "Mia Huber", status: "pending" }),
          ],
        }),
      }),
      "PATCH /api/admin/rsvp/companions/8": () => {
        name = "Noah Beat Huber";
        return { status: 204 };
      },
    });
    renderAt("/admin/rsvp/guests/5");
    user.click(await screen.findByRole("button", { name: "Ändern" }));
    user.click(await screen.findByRole("button", { name: "Weiter" }));
    const next = await screen.findAllByRole("button", { name: "Weiter" });
    user.click(must(next[0]));
    await screen.findByRole("heading", { name: "Begleitpersonen & Musik" });
    expect(
      screen.queryByRole("button", { name: /Begleitperson beantragen/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Zurückziehen: Mia Huber" }),
    ).not.toBeInTheDocument();

    user.click(screen.getByRole("button", { name: "Umbenennen: Noah Huber" }));
    const field = screen.getByLabelText("Name");
    user.type(field, "Noah Beat Huber");
    user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Noah Beat Huber")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      csrf: "csrf-9",
      body: { name: "Noah Beat Huber" },
    });
  });
});

describe("Rückmeldungen: companion requests", () => {
  const overview = (changes: Record<string, unknown> = {}) => ({
    deadline: null,
    songEnabled: true,
    parts: PARTS,
    menus: MENUS,
    totals: [],
    menuTotals: [],
    guests: [
      {
        userId: 5,
        name: "Erika Huber",
        status: "attending",
        invitedPartIds: [1, 3],
        attendingPartIds: [1],
        menuId: null,
        songWish: null,
        allergies: null,
        verifiedEmail: false,
      },
    ],
    companions: [
      {
        ...companion({ id: 7 }),
        hostUserId: 5,
        hostName: "Erika Huber",
      },
      {
        ...companion({
          id: 8,
          name: "Noah Huber",
          status: "approved",
          note: null,
          attendingPartIds: [3],
          menuId: 1,
          allergies: "Laktose",
        }),
        hostUserId: 5,
        hostName: "Erika Huber",
      },
    ],
    pendingCount: 1,
    answered: 1,
    total: 1,
    reminderCount: 0,
    ...changes,
  });

  it("[RSVP-09] the admin approves or rejects a request; approved persons appear under their guest", async () => {
    let current = overview();
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: current }),
      "POST /api/admin/rsvp/companions/7/approve": () => {
        current = overview({ pendingCount: 0 });
        return { status: 204 };
      },
    });
    renderAt("/admin/rsvp");
    const card = must((await screen.findByText("Begleitpersonen-Anfragen (1)")).closest("section"));
    expect(within(card).getByText("Mia Huber")).toBeInTheDocument();
    expect(
      within(card).getByText(/von Erika Huber · «Meine Tochter, 6 Jahre»/),
    ).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Ablehnen: Mia Huber" })).toBeInTheDocument();

    // The approved person is in the table under the guest, with the allergies column.
    const table = screen.getByRole("table");
    const noah = within(table).getByRole("row", { name: /Noah Huber/ });
    expect(within(noah).getByText("Laktose")).toBeInTheDocument();
    expect(within(noah).getByText("bestätigt")).toBeInTheDocument();

    user.click(within(card).getByRole("button", { name: "Annehmen: Mia Huber" }));
    await waitFor(() => {
      expect(screen.queryByText("Begleitpersonen-Anfragen (1)")).not.toBeInTheDocument();
    });
    expect(calls.find((c) => c.method === "POST")?.csrf).toBe("csrf-9");
  });

  it("[RSVP-09] the navigation and the overview tell how many requests wait", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview({ pendingCount: 3 }) }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByRole("img", { name: "3 offene Anfragen" })).toBeInTheDocument();
    expect(await screen.findByText("3 Anfragen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entscheiden" })).toHaveAttribute(
      "href",
      "/admin/rsvp",
    );
  });

  it("[RSVP-09] without requests there is no badge and the tile says so", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({ status: 200, body: overview({ pendingCount: 0 }) }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByText("Keine Anfragen")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /offene Anfragen/ })).not.toBeInTheDocument();
  });
});
