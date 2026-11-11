import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, SITE, user } from "../test/backend.tsx";
import { cleanCode } from "./code.ts";
import { resetSiteNameCache } from "./site.ts";
import { suggestUsername } from "./username.ts";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSiteNameCache();
});

const anonymous = { status: 200, body: { user: null, csrfToken: null } };
const asGuest = { status: 200, body: { user: anna, csrfToken: "csrf-1" } };
const site = () => ({ status: 200, body: SITE });

describe("username suggestion", () => {
  it("[INV-07] suggests a username from the guest's name that fits the rules", () => {
    expect(suggestUsername("Erika Huber")).toBe("erika.huber");
    expect(suggestUsername("Anna Müller-Frei")).toBe("anna.mueller.frei");
    expect(suggestUsername("Zoë Brönnimann")).toBe("zoe.broennimann");
    expect(suggestUsername("  Familie   Brunner ")).toBe("familie.brunner");
    expect(suggestUsername("Jo")).toBe("");
    expect(suggestUsername("---")).toBe("");
    expect(suggestUsername("Max ".repeat(20)).length).toBeLessThanOrEqual(32);
    for (const name of ["Erika Huber", "Anna Müller-Frei", "Zoë Brönnimann"]) {
      expect(suggestUsername(name)).toMatch(/^[a-z0-9._-]{3,32}$/);
    }
  });

  it("[INV-07] cleans a typed or pasted code", () => {
    expect(cleanCode("k7q-mx4")).toBe("K7QMX4");
    expect(cleanCode(" K7Q MX4 ")).toBe("K7QMX4");
    expect(cleanCode("--")).toBe("");
  });
});

describe("the pages without sign-in", () => {
  it("[ACS-09] show the event's name in the brand header, from the public route", async () => {
    fakeBackend({ "GET /api/session": () => anonymous, "GET /api/site": site });
    renderAt("/login");
    expect(await screen.findByText("Lea & Jonas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lea & Jonas" })).toHaveAttribute("href", "/");
  });

  it("[ACS-09] fall back to the app's name if the name cannot be read", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/forgot-password");
    expect(await screen.findByRole("link", { name: "Zappaloo" })).toBeInTheDocument();
  });

  it("[SEC-09] every page of them links the privacy notice", async () => {
    for (const path of [
      "/login",
      "/forgot-password",
      "/invite",
      "/set-password/t",
      "/verify-email/t",
    ]) {
      fakeBackend({ "GET /api/session": () => anonymous });
      renderAt(path);
      expect(
        (await screen.findAllByRole("link", { name: "Datenschutz" }))[0],
        path,
      ).toHaveAttribute("href", "/datenschutz");
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    }
  });

  it("[SEC-09] so do the invitation, the profile, the website and the not-found page", async () => {
    const pages: [string, Record<string, () => { status: number; body?: unknown }>][] = [
      [
        "/invite/K7QMX4",
        {
          "GET /api/session": () => anonymous,
          "GET /api/invitations/K7QMX4": () => ({ status: 200, body: { guestName: "Erika" } }),
        },
      ],
      ["/gibt-es-nicht", { "GET /api/session": () => anonymous }],
      ["/profile", { "GET /api/session": () => asGuest }],
      ["/", { "GET /api/session": () => asGuest }],
    ];
    for (const [path, handlers] of pages) {
      fakeBackend(handlers);
      renderAt(path);
      expect(
        (await screen.findAllByRole("link", { name: "Datenschutz" }))[0],
        path,
      ).toHaveAttribute("href", "/datenschutz");
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    }
  });

  it("[ACC-01] the login page offers the way to redeem an invitation, as a card", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/login");
    const card = (await screen.findByText("Noch kein Konto?")).closest("div");
    if (!card) throw new Error("no card");
    expect(within(card).getByRole("link", { name: "Einladung einlösen" })).toHaveAttribute(
      "href",
      "/invite",
    );
    expect(screen.getByRole("link", { name: "Passwort vergessen?" })).toBeInTheDocument();
  });

  it("[ACC-03] after asking for a reset link the page says to check the mailbox and names the fallback", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/password/forgot": () => ({ status: 204 }),
    });
    renderAt("/forgot-password");
    expect(
      await screen.findByText("Klappt nur mit einer bestätigten E-Mail-Adresse."),
    ).toBeInTheDocument();
    user.type(screen.getByLabelText("Benutzername oder E-Mail"), "anna");
    user.click(screen.getByRole("button", { name: "Link anfordern" }));
    expect(await screen.findByText(/Er gilt 24 Stunden/)).toBeInTheDocument();
    expect(screen.getByText("Keine E-Mail bekommen?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zurück zur Anmeldung" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

describe("the invitation code in six boxes (UX decision 1)", () => {
  const boxes = () =>
    Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`Zeichen ${String(i + 1)} von 6`));

  it("[INV-07] typing jumps to the next box and the button needs all six", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/invite");
    await screen.findByRole("heading", { name: "Einladung einlösen" });
    const next = screen.getByRole("button", { name: "Weiter" });
    expect(next).toBeDisabled();
    fireEvent.change(must(boxes()[0]), { target: { value: "k" } });
    expect(boxes()[0]).toHaveValue("K");
    expect(document.activeElement).toBe(boxes()[1]);
    fireEvent.change(must(boxes()[1]), { target: { value: "7" } });
    expect(next).toBeDisabled();
    fireEvent.paste(must(boxes()[2]), { clipboardData: { getData: () => "q-mx4" } });
    expect(
      boxes()
        .map((box) => (box as HTMLInputElement).value)
        .join(""),
    ).toBe("K7QMX4");
    expect(next).toBeEnabled();
  });

  it("[INV-07] backspace in an empty box clears the one before and goes back", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/invite");
    await screen.findByRole("heading", { name: "Einladung einlösen" });
    fireEvent.paste(must(boxes()[0]), { clipboardData: { getData: () => "K7Q" } });
    expect(
      boxes()
        .map((box) => (box as HTMLInputElement).value)
        .join(""),
    ).toBe("K7Q");
    fireEvent.keyDown(must(boxes()[3]), { key: "Backspace" });
    expect(
      boxes()
        .map((box) => (box as HTMLInputElement).value)
        .join(""),
    ).toBe("K7");
    expect(document.activeElement).toBe(boxes()[2]);
  });

  it("[INV-07] a pasted code with dashes and lower case fills the boxes and opens the invitation", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/invitations/K7QMX4": () => ({ status: 200, body: { guestName: "Erika Huber" } }),
    });
    renderAt("/invite");
    await screen.findByRole("heading", { name: "Einladung einlösen" });
    fireEvent.paste(must(boxes()[0]), { clipboardData: { getData: () => "k7q-mx4" } });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(
      await screen.findByRole("heading", { name: "Schön, dass du da bist, Erika Huber!" }),
    ).toBeInTheDocument();
  });
});

describe("the registration form (UX mock invite-register)", () => {
  const preview = { status: 200, body: { guestName: "Erika Huber" } };

  it("[INV-07] shows the invitation card with the code, suggests the username and has an optional email", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/invitations/k7qmx4": () => preview,
    });
    renderAt("/invite/k7qmx4");
    expect(await screen.findByText("Persönliche Einladung")).toBeInTheDocument();
    expect(screen.getByText("K7QMX4")).toBeInTheDocument();
    expect(screen.getByLabelText("Anzeigename")).toHaveValue("Erika Huber");
    expect(screen.getByLabelText("Benutzername")).toHaveValue("erika.huber");
    expect(screen.getByLabelText("E-Mail (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Passwort")).toHaveAttribute(
      "placeholder",
      "Mindestens 10 Zeichen",
    );
    // No repeated password.
    expect(screen.queryByLabelText("Passwort wiederholen")).not.toBeInTheDocument();
  });

  it("[INV-07] the eye button shows the typed password", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/invitations/K7QMX4": () => preview,
    });
    renderAt("/invite/K7QMX4");
    const password = await screen.findByLabelText("Passwort");
    expect(password).toHaveAttribute("type", "password");
    user.type(password, "mein-langes-passwort");
    user.click(screen.getByRole("button", { name: "Anzeigen" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("mein-langes-passwort");
    user.click(screen.getByRole("button", { name: "Verbergen" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("[INV-07] registering without an email sends none", async () => {
    let current: { status: number; body: unknown } = anonymous;
    const calls = fakeBackend({
      "GET /api/session": () => current,
      "GET /api/invitations/K7QMX4": () => preview,
      "POST /api/invitations/K7QMX4/register": () => ({ status: 201, body: { user: anna } }),
      "POST /api/session": () => {
        current = asGuest;
        return asGuest;
      },
    });
    renderAt("/invite/K7QMX4");
    user.type(await screen.findByLabelText("Passwort"), "a-long-enough-password");
    user.click(screen.getByRole("button", { name: "Konto anlegen" }));
    await screen.findByRole("link", { name: "Profil" });
    expect(calls.find((c) => c.path.endsWith("/register"))?.body).toEqual({
      username: "erika.huber",
      displayName: "Erika Huber",
      password: "a-long-enough-password",
    });
  });

  it("[INV-03][INV-04] an unusable code shows a card with the reason and the ways on", async () => {
    for (const [code, title] of [
      ["invitation_redeemed", "Diese Einladung wurde schon eingelöst."],
      ["invitation_revoked", "Diese Einladung ist nicht mehr gültig."],
      ["invitation_replaced", "Diese Einladung ist nicht mehr gültig."],
      ["invalid_invitation", "Dieser Code ist nicht gültig."],
    ] as const) {
      fakeBackend({
        "GET /api/session": () => anonymous,
        "GET /api/invitations/ABC234": () => ({
          status: 410,
          body: { error: { code, message: "x" } },
        }),
      });
      renderAt("/invite/ABC234");
      expect(await screen.findByRole("alert"), code).toHaveTextContent(title);
      expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/login");
      expect(screen.getByRole("link", { name: "Anderen Code eingeben" })).toHaveAttribute(
        "href",
        "/invite",
      );
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    }
  });
});

describe("the RSVP in the flow frame (UX mock rsvp-parts)", () => {
  const state = {
    name: "Erika",
    deadline: null,
    closed: false,
    songEnabled: true,
    parts: [
      { id: 1, name: "Trauung", startsAt: "2027-06-12T12:00:00.000Z", place: null, hasMeal: false },
    ],
    menus: [],
    answer: null,
    companions: [],
  };

  it("[RSVP-01] has a close button, the title, the step counter with a progress bar and a sticky action bar", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({ status: 200, body: state }),
    });
    renderAt("/rsvp");
    expect(
      await screen.findByRole("heading", { name: "Bist du dabei, Erika?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schliessen" })).toHaveAttribute("href", "/");
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(document.querySelectorAll(".guest-flow-progress i")).toHaveLength(3);
    expect(document.querySelectorAll(".guest-flow-progress i.on")).toHaveLength(1);
    // The action button is in the footer of the frame.
    const footer = document.querySelector(".guest-flow-foot");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole("button", { name: "Weiter" })).toBeDisabled();
    // The privacy link is on the page.
    expect(screen.getByRole("link", { name: "Datenschutz" })).toBeInTheDocument();
  });
});

describe("the page for an unknown path (UX mock not-found)", () => {
  it("[ACS-09] a signed-in user sees a card and the way to the start page", async () => {
    fakeBackend({ "GET /api/session": () => asGuest });
    renderAt("/gibt/es/nicht");
    expect(
      await screen.findByRole("heading", { name: "Seite nicht gefunden" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Diese Seite gibt es nicht (mehr).")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
  });
});

describe("confirming the email address (UX mock verify-email)", () => {
  it("[ACC-09] shows the button first, then the confirmation with the way to the profile", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({ status: 204 }),
    });
    renderAt("/verify-email/token");
    expect(
      await screen.findByRole("heading", { name: "E-Mail-Adresse bestätigen" }),
    ).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Adresse bestätigen" }));
    expect(await screen.findByRole("heading", { name: "Adresse bestätigt" })).toBeInTheDocument();
    expect(
      screen.getByText(/dich anmelden und dein Passwort per E-Mail zurücksetzen/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Profil" })).toHaveAttribute("href", "/profile");
  });

  it("[ACC-09] any other failure is shown with its message", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({
        status: 429,
        body: { error: { code: "rate_limited", message: "x" } },
      }),
    });
    renderAt("/verify-email/token");
    user.click(await screen.findByRole("button", { name: "Adresse bestätigen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-Mail-Adresse bestätigen");
    expect(screen.getByText(/Zu viele Versuche/)).toBeInTheDocument();
  });
});
