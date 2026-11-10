import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { routes } from "./routes.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const anna = {
  id: 1,
  username: "anna",
  displayName: "Anna",
  email: null,
  emailStatus: "unverified",
  roles: ["vip"],
  capabilities: [],
};
const event = {
  id: "event-muster",
  name: "Event Muster",
  slug: "event-muster",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  features: {
    minigames: true,
    snapshots: true,
    gallery: true,
    keepsakes: true,
    rsvp: true,
    treasureHunt: true,
    eventScreen: true,
  },
  settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: false },
};

interface Call {
  method: string;
  path: string;
  body: unknown;
  csrf: string | null;
}

/** A fake backend: `handlers` map "METHOD /path" to a status and body. */
function fakeBackend(handlers: Record<string, () => { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        method,
        path,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        csrf: headers.get("x-csrf-token"),
      });
      if (path === "/api/version")
        return Promise.resolve(Response.json({ version: "0.0.0", commit: "x" }));
      if (path === "/api/event") return Promise.resolve(Response.json(event));
      const handler = handlers[`${method} ${path}`];
      if (!handler)
        return Promise.resolve(
          Response.json({ error: { code: "not_found", message: "?" } }, { status: 404 }),
        );
      const { status, body } = handler();
      return Promise.resolve(
        status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
      );
    }),
  );
  return calls;
}

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

/** Fills a field and clicks buttons like a user (no extra dependency needed). */
const user = {
  type(field: HTMLElement, text: string) {
    fireEvent.change(field, { target: { value: text } });
  },
  clear(field: HTMLElement) {
    fireEvent.change(field, { target: { value: "" } });
  },
  click(element: HTMLElement) {
    fireEvent.click(element);
  },
};

const anonymous = { status: 200, body: { user: null, csrfToken: null } };
const signedIn = { status: 200, body: { user: anna, csrfToken: "csrf-1" } };

describe("signing in", () => {
  it("[ACC-01] logs in with username and password and then offers profile and logout", async () => {
    let current: { status: number; body: unknown } = anonymous;
    const calls = fakeBackend({
      "GET /api/session": () => current,
      "POST /api/session": () => {
        current = signedIn;
        return signedIn;
      },
      "DELETE /api/session": () => {
        current = anonymous;
        return { status: 204 };
      },
    });
    renderAt("/login");
    user.type(await screen.findByLabelText("Benutzername"), "anna");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("link", { name: "Profil" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      username: "anna",
      password: "correct-horse-battery",
    });

    user.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(await screen.findByRole("link", { name: "Anmelden" })).toBeInTheDocument();
    // Logging out sends the session's CSRF token (SEC-01).
    expect(calls.find((c) => c.method === "DELETE")?.csrf).toBe("csrf-1");
  });

  it("[ACC-01] says so when the credentials are wrong, and when there were too many attempts", async () => {
    let status = 401;
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/session": () => ({
        status,
        body: {
          error: { code: status === 401 ? "invalid_credentials" : "rate_limited", message: "x" },
        },
      }),
    });
    renderAt("/login");
    user.type(await screen.findByLabelText("Benutzername"), "anna");
    user.type(screen.getByLabelText("Passwort"), "wrong-password");
    user.click(screen.getByRole("button", { name: "Anmelden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Benutzername oder Passwort stimmt nicht.",
    );

    status = 429;
    user.click(screen.getByRole("button", { name: "Anmelden" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Zu viele Versuche");
    });
  });

  it("[ACC-01] a signed-in user is sent away from the login page", async () => {
    fakeBackend({ "GET /api/session": () => signedIn });
    renderAt("/login");
    expect(
      await screen.findByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).toBeInTheDocument();
  });
});

describe("setting a password with a link", () => {
  it("[ACC-14] sends the token from the link with the new password, then points to the login", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/password/set": () => ({ status: 204 }),
    });
    renderAt("/set-password/the-token-from-the-link");
    user.type(await screen.findByLabelText("Passwort"), "a-long-enough-password");
    user.type(screen.getByLabelText("Passwort wiederholen"), "a-long-enough-password");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(
      await screen.findByRole("heading", { name: "Passwort gespeichert" }),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/password/set")?.body).toEqual({
      token: "the-token-from-the-link",
      newPassword: "a-long-enough-password",
    });
  });

  it("[ACC-14] does not send two different passwords, and reports an invalid link", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/password/set": () => ({
        status: 400,
        body: { error: { code: "invalid_link", message: "x" } },
      }),
    });
    renderAt("/set-password/old-token");
    user.type(await screen.findByLabelText("Passwort"), "a-long-enough-password");
    user.type(screen.getByLabelText("Passwort wiederholen"), "something-different-1");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die beiden Passwörter sind nicht gleich.",
    );
    expect(calls.some((c) => c.path === "/api/password/set")).toBe(false);

    user.clear(screen.getByLabelText("Passwort wiederholen"));
    user.type(screen.getByLabelText("Passwort wiederholen"), "a-long-enough-password");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ungültig, abgelaufen oder wurde schon benutzt",
      );
    });
  });
});

describe("profile", () => {
  it("[ACC-04] shows the profile, saves changes with the CSRF token and sends visitors to the login", async () => {
    const saved = { ...anna, displayName: "Anna Muster", email: "anna@example.org" };
    const calls = fakeBackend({
      "GET /api/session": () => signedIn,
      "PATCH /api/profile": () => ({ status: 200, body: saved }),
    });
    renderAt("/profile");
    const name = await screen.findByLabelText("Anzeigename");
    expect(name).toHaveValue("Anna");
    expect(screen.getByText("Benutzername: anna")).toBeInTheDocument();
    user.clear(name);
    user.type(name, "Anna Muster");
    user.type(screen.getByLabelText("E-Mail-Adresse (optional)"), "anna@example.org");
    user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Gespeichert.");
    expect(screen.getByText("Die Adresse ist noch nicht bestätigt.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.csrf).toBe("csrf-1");
    expect(patch?.body).toEqual({ displayName: "Anna Muster", email: "anna@example.org" });
  });

  it("[ACC-06] changes the password with the current one", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => signedIn,
      "POST /api/profile/password": () => ({ status: 204 }),
    });
    renderAt("/profile");
    user.type(await screen.findByLabelText("Aktuelles Passwort"), "correct-horse-battery");
    user.type(screen.getByLabelText(/^Neues Passwort/), "another-long-password");
    user.click(screen.getByRole("button", { name: "Passwort ändern" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Das Passwort wurde geändert.");
    expect(calls.find((c) => c.path === "/api/profile/password")).toMatchObject({
      csrf: "csrf-1",
      body: { currentPassword: "correct-horse-battery", newPassword: "another-long-password" },
    });
  });

  it("[ACC-04] a visitor without a session is sent to the login page", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/profile");
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
  });
});

describe("email and account self-service", () => {
  it("[ACC-03] asks for a reset link by username or address and answers the same either way", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/password/forgot": () => ({ status: 204 }),
    });
    renderAt("/forgot-password");
    user.type(await screen.findByLabelText("Benutzername oder E-Mail-Adresse"), "anna@example.org");
    user.click(screen.getByRole("button", { name: "Link anfordern" }));
    expect(await screen.findByRole("heading", { name: "Anfrage gesendet" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/password/forgot")?.body).toEqual({
      identifier: "anna@example.org",
    });
  });

  it("[ACC-03] the login page links to the forgotten-password page", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/login");
    expect(await screen.findByRole("link", { name: "Passwort vergessen?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("[ACC-09] requests the verification mail from the profile", async () => {
    const withEmail = { ...anna, email: "anna@example.org" };
    const calls = fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: withEmail, csrfToken: "csrf-1" } }),
      "POST /api/profile/email/verify": () => ({ status: 204 }),
    });
    renderAt("/profile");
    user.click(await screen.findByRole("button", { name: "Bestätigungslink senden" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Wir haben dir einen Link");
    expect(calls.find((c) => c.path === "/api/profile/email/verify")?.csrf).toBe("csrf-1");
  });

  it("[ACC-09] confirms the address from the link", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({ status: 204 }),
    });
    renderAt("/verify-email/token-from-mail");
    expect(await screen.findByRole("heading", { name: "Adresse bestätigt" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/email/verify")?.body).toEqual({
      token: "token-from-mail",
    });
  });

  it("[ACC-09] says so when the verification link is invalid", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({
        status: 400,
        body: { error: { code: "invalid_link", message: "x" } },
      }),
    });
    renderAt("/verify-email/old");
    expect(await screen.findByRole("alert")).toHaveTextContent("ungültig, abgelaufen");
  });

  it("[ACC-12] deletes the account after the password and signs the user out", async () => {
    let current: { status: number; body: unknown } = signedIn;
    const calls = fakeBackend({
      "GET /api/session": () => current,
      "DELETE /api/profile": () => {
        current = anonymous;
        return { status: 204 };
      },
    });
    renderAt("/profile");
    user.type(
      await screen.findByLabelText("Passwort", { selector: "[name=deletePassword]" }),
      "pw-pw-pw-pw-pw",
    );
    user.click(screen.getByRole("button", { name: "Konto endgültig löschen" }));
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE" && c.path === "/api/profile")).toMatchObject({
      csrf: "csrf-1",
      body: { password: "pw-pw-pw-pw-pw" },
    });
  });

  it("[ACC-12] explains why the last admin cannot delete the account", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "DELETE /api/profile": () => ({
        status: 409,
        body: { error: { code: "last_admin", message: "x" } },
      }),
    });
    renderAt("/profile");
    user.type(
      await screen.findByLabelText("Passwort", { selector: "[name=deletePassword]" }),
      "pw-pw-pw-pw-pw",
    );
    user.click(screen.getByRole("button", { name: "Konto endgültig löschen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("letzte Admin-Person");
  });
});

describe("invitations", () => {
  const preview = { status: 200, body: { guestName: "Anna Muster" } };

  it("[INV-07] a new guest registers with the code and is signed in", async () => {
    let current: { status: number; body: unknown } = anonymous;
    const calls = fakeBackend({
      "GET /api/session": () => current,
      "GET /api/invitations/K7QMX4": () => preview,
      "POST /api/invitations/K7QMX4/register": () => ({
        status: 201,
        body: { user: anna },
      }),
      "POST /api/session": () => {
        current = signedIn;
        return signedIn;
      },
    });
    renderAt("/invite/K7QMX4");
    expect(
      await screen.findByRole("heading", { name: "Willkommen, Anna Muster!" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Anzeigename")).toHaveValue("Anna Muster");
    user.type(screen.getByLabelText("Benutzername"), "Anna");
    user.type(screen.getByLabelText("Passwort"), "a-long-enough-password");
    user.type(screen.getByLabelText("Passwort wiederholen"), "a-long-enough-password");
    user.click(screen.getByRole("button", { name: "Konto anlegen" }));

    expect(await screen.findByRole("link", { name: "Profil" })).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/register"))?.body).toEqual({
      username: "anna",
      displayName: "Anna Muster",
      password: "a-long-enough-password",
    });
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/session")?.body).toEqual({
      username: "anna",
      password: "a-long-enough-password",
    });
  });

  it("[INV-03][INV-04] explains a redeemed, expired or unknown code", async () => {
    for (const [code, expected] of [
      ["invitation_redeemed", "schon eingelöst"],
      ["invitation_expired", "abgelaufen"],
      ["invalid_invitation", "nicht gültig"],
    ] as const) {
      fakeBackend({
        "GET /api/session": () => anonymous,
        "GET /api/invitations/ABC": () => ({
          status: 410,
          body: { error: { code, message: "x" } },
        }),
      });
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/invite/ABC"] })} />,
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(expected);
      unmount();
    }
  });

  it("[INV-07] the code can be typed in on the invitation page", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/invitations/K7QMX4": () => preview,
    });
    renderAt("/invite");
    user.type(await screen.findByLabelText("Einladungscode"), "k7q-mx4");
    user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(
      await screen.findByRole("heading", { name: "Willkommen, Anna Muster!" }),
    ).toBeInTheDocument();
  });

  it("[INV-07][ACC-07] a signed-in user without vip redeems the code on their account", async () => {
    const helper = { ...anna, roles: ["staff"] };
    const calls = fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: helper, csrfToken: "csrf-1" } }),
      "GET /api/invitations/K7QMX4": () => preview,
      "POST /api/invitations/K7QMX4/redeem": () => ({
        status: 200,
        body: { user: { ...helper, roles: ["staff", "vip"] } },
      }),
    });
    renderAt("/invite/K7QMX4");
    user.click(await screen.findByRole("button", { name: "Einladung einlösen" }));
    await waitFor(() => {
      expect(calls.find((c) => c.path.endsWith("/redeem"))?.csrf).toBe("csrf-1");
    });
    expect(
      await screen.findByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).toBeInTheDocument();
  });

  const admin = { ...anna, roles: ["admin"] };
  const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };
  const row = {
    id: 1,
    guestName: "Anna Muster",
    note: null,
    status: "active",
    expiresAt: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    redeemedAt: null,
    redeemedBy: null,
  };

  it("[INV-01][INV-14] an admin creates invitations and gets cards with code and QR code", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [] } }),
      "POST /api/admin/invitations": () => ({
        status: 201,
        body: {
          invitations: [{ ...row, code: "K7QMX4", url: "http://localhost:5173/invite/K7QMX4" }],
        },
      }),
    });
    renderAt("/admin/invitations");
    user.type(await screen.findByLabelText("Gäste (ein Name pro Zeile)"), "Anna Muster\nBen");
    user.click(screen.getByRole("button", { name: "Einladungen erstellen" }));

    expect(await screen.findByText("K7QMX4")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "QR-Code der Einladung für Anna Muster" }),
    ).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    expect(screen.getByRole("button", { name: "Karten drucken" })).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.csrf).toBe("csrf-1");
    expect(post?.body).toEqual({ guests: [{ name: "Anna Muster" }, { name: "Ben" }] });
  });

  it("[INV-05] an admin revokes and regenerates a code from the list", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/invitations": () => ({ status: 200, body: { invitations: [row] } }),
      "POST /api/admin/invitations/1/revoke": () => ({
        status: 200,
        body: { ...row, status: "revoked" },
      }),
      "POST /api/admin/invitations/1/regenerate": () => ({
        status: 201,
        body: {
          ...row,
          id: 2,
          code: "AAAABB",
          url: "http://localhost:5173/invite/AAAABB",
        },
      }),
    });
    renderAt("/admin/invitations");
    expect(await screen.findByText("Offen")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Neu erstellen" }));
    expect(await screen.findByText("AAAABB")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Widerrufen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/invitations/1/revoke")).toBe(true);
    });
  });

  it("[INV-01] the admin page is not for other users", async () => {
    fakeBackend({ "GET /api/session": () => signedIn });
    renderAt("/admin/invitations");
    expect(
      await screen.findByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Einladungen" })).not.toBeInTheDocument();
  });
});

describe("sign-in is required (ACS-09)", () => {
  it("[ACS-09] sends a visitor from any other page to the login page, and back after signing in", async () => {
    let current: { status: number; body: unknown } = anonymous;
    const calls = fakeBackend({
      "GET /api/session": () => current,
      "POST /api/session": () => {
        current = signedIn;
        return signedIn;
      },
    });
    renderAt("/profile");
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    user.type(screen.getByLabelText("Benutzername"), "anna");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    user.click(screen.getByRole("button", { name: "Anmelden" }));
    // The visitor wanted the profile and lands there.
    expect(await screen.findByRole("heading", { name: "Profil" })).toBeInTheDocument();
    // The event is only asked for once there is a session.
    expect(calls.findIndex((c) => c.path === "/api/event")).toBeGreaterThan(
      calls.findIndex((c) => c.method === "POST" && c.path === "/api/session"),
    );
  });

  it("[ACS-09] the start page, the game, the profile and unknown pages need a session", async () => {
    for (const path of ["/", "/game", "/profile", "/admin/invitations", "/does/not/exist"]) {
      const calls = fakeBackend({ "GET /api/session": () => anonymous });
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
      );
      expect(await screen.findByRole("heading", { name: "Anmelden" }), path).toBeInTheDocument();
      expect(
        calls.some((c) => c.path === "/api/event"),
        path,
      ).toBe(false);
      unmount();
    }
  });

  it("[ACS-09] login, password reset, verification and invitation pages work without a session", async () => {
    const pages: [string, string][] = [
      ["/login", "Anmelden"],
      ["/forgot-password", "Passwort vergessen"],
      ["/set-password/some-token", "Passwort festlegen"],
      ["/invite", "Einladung einlösen"],
    ];
    for (const [path, heading] of pages) {
      fakeBackend({ "GET /api/session": () => anonymous });
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
      );
      expect(await screen.findByRole("heading", { name: heading }), path).toBeInTheDocument();
      unmount();
    }
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({ status: 204 }),
      "GET /api/invitations/K7QMX4": () => ({ status: 200, body: { guestName: "Anna" } }),
    });
    const { unmount } = render(
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ["/verify-email/t"] })}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Adresse bestätigt" })).toBeInTheDocument();
    unmount();
    renderAt("/invite/K7QMX4");
    expect(await screen.findByRole("heading", { name: "Willkommen, Anna!" })).toBeInTheDocument();
  });
});
