import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WAITING_TEXTS } from "@zappaloo/shared";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, renderAt, user } from "../test/backend.tsx";
import { timeLeft } from "./time.ts";

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  // jsdom has no canvas: the scene simply does not draw.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const closedEvent = { ...event, settings: { ...event.settings, platformOpen: false } };
const closed = () => ({ status: 200, body: closedEvent });
const guest = { ...anna, displayName: "Erika" };
const asGuest = { status: 200, body: { user: guest, csrfToken: "csrf-1" } };
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-9" } };
const staff = { ...anna, id: 8, roles: ["staff"] };

function page(changes: Record<string, unknown> = {}) {
  return {
    eventName: "Lea & Jonas",
    open: false,
    status: "none",
    text: "Psst, Erika … hinter dieser Tür entsteht gerade etwas.",
    countdownTo: null,
    rsvp: true,
    ...changes,
  };
}
const door = () => ({ status: 200, body: { kind: "default" } });

describe("the waiting page", () => {
  it("[ACS-10][ACS-11][ACS-12] a guest of a closed platform lands on the door scene with the event name, Profil, Abmelden and the text", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page() }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    expect(
      await screen.findByText("Psst, Erika … hinter dieser Tür entsteht gerade etwas."),
    ).toBeInTheDocument();
    expect(screen.getByText("Lea & Jonas")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /angelehnte Tür/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profil" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
    // No website navigation: the page is a scene of its own.
    expect(screen.queryByRole("link", { name: "Spielwelt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start" })).not.toBeInTheDocument();
  });

  it("[ACS-11] the button asks for the RSVP, or offers to change it once there is an answer", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page({ status: "attending" }) }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    const change = await screen.findByRole("link", { name: "Rückmeldung ändern" });
    expect(change).toHaveAttribute("href", "/rsvp");
    expect(screen.queryByRole("link", { name: "Rückmeldung geben" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/waiting")).toBe(true);
  });

  it("[ACS-11] a not-yet-answered guest is asked to answer; without the RSVP there is no button", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page() }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Rückmeldung geben" })).toBeInTheDocument();
  });

  it("[ACS-11] the RSVP button is missing while the feature is off", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page({ rsvp: false }) }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    await screen.findByText(/Psst, Erika/);
    expect(screen.queryByRole("link", { name: /Rückmeldung/ })).not.toBeInTheDocument();
  });

  it("[ACS-10] from the waiting page a guest reaches the RSVP and the profile, with a way back and without the website menu", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page() }),
      "GET /api/waiting/door": door,
    });
    renderAt("/profile");
    // The profile has the normal header, but only the way back to the waiting page.
    const nav = (await screen.findByRole("link", { name: "Warteseite" })).closest("nav");
    if (!nav) throw new Error("no navigation");
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Warteseite", "Rückmeldung", "Profil"]);
    expect(within(nav).queryByRole("link", { name: "Spielwelt" })).not.toBeInTheDocument();
  });

  it("[ACS-10] a guest who opens the game world is sent back to the waiting page", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page() }),
      "GET /api/waiting/door": door,
    });
    renderAt("/game");
    expect(await screen.findByText(/Psst, Erika/)).toBeInTheDocument();
    expect(screen.queryByTestId("game-canvas")).not.toBeInTheDocument();
  });

  it("[ACS-10] staff and admins see the website while the platform is closed", async () => {
    fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: staff, csrfToken: "c" } }),
      "GET /api/event": closed,
    });
    renderAt("/");
    expect(await screen.findByText("Willkommen!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spielwelt" })).toBeInTheDocument();
  });

  it("[ACS-10] once the platform is open, guests see the website", async () => {
    fakeBackend({ "GET /api/session": () => asGuest });
    renderAt("/");
    expect(await screen.findByText("Willkommen!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spielwelt" })).toBeInTheDocument();
  });
});

describe("the countdown (ACS-13)", () => {
  it("[ACS-13] shows the time left only when the admin switched it on, and says nothing otherwise", async () => {
    const target = new Date(Date.now() + ((12 * 24 + 4) * 60 + 31) * 60_000 + 9_000).toISOString();
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page({ countdownTo: target }) }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    const timer = await screen.findByRole("timer", { name: "Zeit bis zur Öffnung" });
    expect(within(timer).getByText("Tage")).toBeInTheDocument();
    expect(within(timer).getByText("12")).toBeInTheDocument();
    expect(within(timer).getByText("04")).toBeInTheDocument();
  });

  it("[ACS-13] no countdown without the switch", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page() }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    await screen.findByText(/Psst, Erika/);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("[ACS-13] the countdown disappears when it reaches zero; the text stays", async () => {
    const target = new Date(Date.now() + 3_500).toISOString();
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": closed,
      "GET /api/waiting": () => ({ status: 200, body: page({ countdownTo: target }) }),
      "GET /api/waiting/door": door,
    });
    renderAt("/");
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      },
      { timeout: 6000 },
    );
    expect(screen.getByText(/Psst, Erika/)).toBeInTheDocument();
  });

  it("[ACS-13] works out days, hours, minutes and seconds, and nothing after the date", () => {
    const now = Date.parse("2027-05-01T12:00:00.000Z");
    expect(timeLeft(now + ((12 * 24 + 4) * 60 + 31) * 60_000 + 9_000, now)).toEqual({
      days: 12,
      hours: 4,
      minutes: 31,
      seconds: 9,
    });
    expect(timeLeft(now + 500, now)).toBeNull();
    expect(timeLeft(now - 1000, now)).toBeNull();
  });
});

describe("Einstellungen: Plattform öffnen and Warteseite-Texte", () => {
  const config = (changes: Record<string, unknown> = {}) => ({
    openingAt: null,
    countdownEnabled: false,
    texts: DEFAULT_WAITING_TEXTS,
    custom: { none: false, attending: false, declined: false },
    ...changes,
  });

  it("[ACS-13] the admin announces an opening date in the event's time zone and switches the countdown", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": closed,
      "GET /api/admin/waiting": () => ({ status: 200, body: config() }),
      "PATCH /api/admin/waiting": () => ({ status: 200, body: config() }),
    });
    renderAt("/admin/settings");
    const card = (await screen.findByText("Plattform öffnen", { selector: "b" })).closest(
      "section",
    );
    if (!card) throw new Error("no card");
    expect(within(card).getByText("Plattform geschlossen")).toBeInTheDocument();
    user.type(within(card).getByLabelText(/Angekündigtes Öffnungsdatum/), "2027-05-15T18:00");
    user.click(within(card).getByRole("button", { name: "Datum speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });
    // 18:00 in Zurich (summer time) is 16:00 UTC.
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      csrf: "csrf-9",
      body: { openingAt: "2027-05-15T16:00:00.000Z" },
    });

    user.click(within(card).getByRole("switch", { name: "Countdown auf der Warteseite zeigen" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PATCH")[1]?.body).toEqual({ countdownEnabled: true });
  });

  it("[ACS-13] an announced date is shown in the event's time zone, and can be removed", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": closed,
      "GET /api/admin/waiting": () => ({
        status: 200,
        body: config({ openingAt: "2027-05-15T16:00:00.000Z", countdownEnabled: true }),
      }),
      "PATCH /api/admin/waiting": () => ({ status: 200, body: config() }),
    });
    renderAt("/admin/settings");
    const field = await screen.findByLabelText(/Angekündigtes Öffnungsdatum/);
    expect(field).toHaveValue("2027-05-15T18:00");
    expect(
      screen.getByRole("switch", { name: "Countdown auf der Warteseite zeigen" }),
    ).toHaveAttribute("aria-checked", "true");
    user.clear(field);
    user.click(screen.getByRole("button", { name: "Datum speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ openingAt: null });
  });

  it("[ACS-11] the three texts show their defaults; only edited texts are sent", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": closed,
      "GET /api/admin/waiting": () => ({ status: 200, body: config() }),
      "PATCH /api/admin/waiting": () => ({ status: 200, body: config() }),
    });
    renderAt("/admin/settings");
    const none = await screen.findByLabelText("Noch nicht geantwortet");
    expect(none).toHaveValue(DEFAULT_WAITING_TEXTS.none);
    expect(screen.getByLabelText("Zugesagt")).toHaveValue(DEFAULT_WAITING_TEXTS.attending);
    expect(screen.getByLabelText("Abgesagt")).toHaveValue(DEFAULT_WAITING_TEXTS.declined);
    expect(
      screen.getByText(/Platzhalter: \{name\}, \{waitingCount\}, \{openingDate\}/),
    ).toBeInTheDocument();

    user.type(none, "Hallo {name}, bald geht's los!");
    user.click(screen.getByRole("button", { name: "Texte speichern" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      texts: { none: "Hallo {name}, bald geht's los!" },
    });
  });

  it("[ACS-11] a changed text can go back to the default", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": closed,
      "GET /api/admin/waiting": () => ({
        status: 200,
        body: config({
          texts: { ...DEFAULT_WAITING_TEXTS, declined: "Schade!" },
          custom: { none: false, attending: false, declined: true },
        }),
      }),
      "PATCH /api/admin/waiting": () => ({ status: 200, body: config() }),
    });
    renderAt("/admin/settings");
    expect(await screen.findByLabelText("Abgesagt")).toHaveValue("Schade!");
    // Only a changed text offers the default.
    expect(
      screen.queryByRole("button", { name: "Standardtext: Zugesagt" }),
    ).not.toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Standardtext: Abgesagt" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ texts: { declined: null } });
  });

  it("[ACS-11] a refused change is reported", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": closed,
      "GET /api/admin/waiting": () => ({ status: 200, body: config() }),
      "PATCH /api/admin/waiting": () => ({
        status: 400,
        body: { error: { code: "validation_failed", message: "bad" } },
      }),
    });
    renderAt("/admin/settings");
    user.click(await screen.findByRole("switch", { name: "Countdown auf der Warteseite zeigen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitte prüfe deine Eingaben.");
  });
});
