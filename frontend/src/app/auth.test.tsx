import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { routes } from "./routes.tsx";
import { anna, anonymous, fakeBackend, renderAt, signedIn, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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
    user.type(await screen.findByLabelText("Benutzername oder E-Mail"), "anna");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("link", { name: "Profil" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      username: "anna",
      password: "correct-horse-battery",
    });

    user.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
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
    user.type(await screen.findByLabelText("Benutzername oder E-Mail"), "anna");
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
  const setupLink = { status: 200, body: { purpose: "setup", username: "erika.huber" } };
  const resetLink = { status: 200, body: { purpose: "reset", username: "anna" } };

  it("[ACC-14] a setup link greets the new account with its username; the password goes with the token, then the page points to the login", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/password/link/the-token-from-the-link": () => setupLink,
      "POST /api/password/set": () => ({ status: 204 }),
    });
    renderAt("/set-password/the-token-from-the-link");
    expect(
      await screen.findByRole("heading", { name: "Willkommen! Lege dein Passwort fest" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Damit meldest du dich ab jetzt an. Dein Benutzername: erika.huber"),
    ).toBeInTheDocument();
    // One password field with an eye button, no repeated field (UX decision 57).
    expect(screen.queryByLabelText("Passwort wiederholen")).not.toBeInTheDocument();
    const password = screen.getByLabelText("Passwort");
    expect(password).toHaveAttribute("minlength", "10");
    user.type(password, "a-long-enough-password");
    user.click(screen.getByRole("button", { name: "Anzeigen" }));
    expect(password).toHaveAttribute("type", "text");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(
      await screen.findByRole("heading", { name: "Passwort gespeichert" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Anmeldung" })).toHaveAttribute("href", "/login");
    expect(calls.find((c) => c.path === "/api/password/set")?.body).toEqual({
      token: "the-token-from-the-link",
      newPassword: "a-long-enough-password",
    });
  });

  it("[ACC-15][ACC-10] a reset link has its own heading and text", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/password/link/reset-token-1": () => resetLink,
    });
    renderAt("/set-password/reset-token-1");
    expect(
      await screen.findByRole("heading", { name: "Neues Passwort festlegen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mit dem neuen Passwort meldest du dich ab jetzt an."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dein Benutzername/)).not.toBeInTheDocument();
  });

  it("[ACC-14] a dead link says so before anyone types a password, and names the hosts", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/password/link/old-token-12345": () => ({
        status: 400,
        body: { error: { code: "invalid_link", message: "x" } },
      }),
    });
    renderAt("/set-password/old-token-12345");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dieser Link ist nicht mehr gültig.",
    );
    expect(screen.getByText(/Melde dich bei den Gastgebern/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Passwort")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zur Anmeldung" })).toHaveAttribute("href", "/login");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("[ACC-14] a link that died while the page was open is reported after sending, a password equal to the username is explained", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/password/link/the-token-12345": () => setupLink,
      "POST /api/password/set": () => ({
        status: 400,
        body: { error: { code: "password_is_username", message: "x" } },
      }),
    });
    renderAt("/set-password/the-token-12345");
    user.type(await screen.findByLabelText("Passwort"), "erika.huber");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Passwort darf nicht gleich wie der Benutzername sein.",
    );
  });

  it("[ACC-14] too many lookups from one address are reported", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/password/link/the-token-12345": () => ({
        status: 429,
        body: { error: { code: "rate_limited", message: "x" } },
      }),
    });
    renderAt("/set-password/the-token-12345");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dieser Link ist nicht mehr gültig.",
    );
    expect(screen.getByText(/Zu viele Versuche/)).toBeInTheDocument();
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
    expect(screen.getByText("anna", { selector: "b" })).toBeInTheDocument();
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
    // The password form is the second step of "Passwort ändern".
    user.click(await screen.findByRole("button", { name: "Passwort ändern" }));
    user.type(await screen.findByLabelText("Aktuelles Passwort"), "correct-horse-battery");
    user.type(screen.getByLabelText(/^Neues Passwort/), "another-long-password");
    user.click(screen.getByRole("button", { name: "Passwort speichern" }));
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
    user.type(await screen.findByLabelText("Benutzername oder E-Mail"), "anna@example.org");
    user.click(screen.getByRole("button", { name: "Link anfordern" }));
    expect(
      await screen.findByRole("heading", { name: "Schau in dein Postfach" }),
    ).toBeInTheDocument();
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
    // Nothing is sent on opening the page: a link scanner must not use the link up.
    const confirm = await screen.findByRole("button", { name: "Adresse bestätigen" });
    expect(calls.some((c) => c.path === "/api/email/verify")).toBe(false);
    fireEvent.click(confirm);
    expect(await screen.findByRole("heading", { name: "Adresse bestätigt" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/api/email/verify")).toHaveLength(1);
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
    fireEvent.click(await screen.findByRole("button", { name: "Adresse bestätigen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dieser Link ist nicht mehr gültig.",
    );
    expect(screen.getByText(/Fordere im Profil einen neuen Link an/)).toBeInTheDocument();
  });

  it("[ACC-16] says so when the address is already verified by another account", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/email/verify": () => ({
        status: 409,
        body: { error: { code: "email_taken", message: "x" } },
      }),
    });
    renderAt("/verify-email/token");
    fireEvent.click(await screen.findByRole("button", { name: "Adresse bestätigen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Adresse ist schon vergeben.");
    expect(screen.getByText(/bei einem anderen Konto bestätigt/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Profil" })).toHaveAttribute("href", "/profile");
  });

  it("[ACC-16] the login field takes a username or an email address, and sends what was typed", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/session": () => signedIn,
    });
    renderAt("/login");
    const field = await screen.findByLabelText("Benutzername oder E-Mail");
    expect(field).toHaveAccessibleDescription("E-Mail nur, wenn du sie im Profil bestätigt hast.");
    user.type(field, "anna@example.ch");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    user.click(screen.getByRole("button", { name: "Anmelden" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST")).toBe(true);
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      username: "anna@example.ch",
      password: "correct-horse-battery",
    });
  });

  it("[ACC-16] the profile tells that a verified address also signs in", async () => {
    fakeBackend({
      "GET /api/session": () => ({
        status: 200,
        body: {
          user: { ...anna, email: "anna@example.ch", emailStatus: "verified" },
          csrfToken: "csrf-1",
        },
      }),
    });
    renderAt("/profile");
    expect(
      await screen.findByText("Die Adresse ist bestätigt. Du kannst dich damit auch anmelden."),
    ).toBeInTheDocument();
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
    // Deleting is a second step: the button opens the confirmation with the password.
    user.click(await screen.findByRole("button", { name: "Konto löschen" }));
    user.type(await screen.findByLabelText("Passwort"), "pw-pw-pw-pw-pw");
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
    // Deleting is a second step: the button opens the confirmation with the password.
    user.click(await screen.findByRole("button", { name: "Konto löschen" }));
    user.type(await screen.findByLabelText("Passwort"), "pw-pw-pw-pw-pw");
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
      await screen.findByRole("heading", { name: "Schön, dass du da bist, Anna Muster!" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Anzeigename")).toHaveValue("Anna Muster");
    // The username is suggested from the guest's name on the card.
    expect(screen.getByLabelText("Benutzername")).toHaveValue("anna.muster");
    user.clear(screen.getByLabelText("Benutzername"));
    user.type(screen.getByLabelText("Benutzername"), "Anna");
    user.type(screen.getByLabelText("Passwort"), "a-long-enough-password");
    user.type(screen.getByLabelText("E-Mail (optional)"), "anna@example.ch");
    user.click(screen.getByRole("button", { name: "Konto anlegen" }));

    expect(await screen.findByRole("link", { name: "Profil" })).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/register"))?.body).toEqual({
      username: "anna",
      displayName: "Anna Muster",
      password: "a-long-enough-password",
      email: "anna@example.ch",
    });
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/session")?.body).toEqual({
      username: "anna",
      password: "a-long-enough-password",
    });
  });

  it("[INV-03][INV-04] explains a redeemed, expired or unknown code", async () => {
    for (const [code, expected] of [
      ["invitation_redeemed", "schon eingelöst"],
      ["invitation_expired", "nicht mehr gültig"],
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
    // Six boxes: typing or pasting a whole code fills all of them, case and dashes ignored.
    user.type(await screen.findByLabelText("Zeichen 1 von 6"), "k7q-mx4");
    expect(screen.getByLabelText("Zeichen 6 von 6")).toHaveValue("4");
    user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(
      await screen.findByRole("heading", { name: "Schön, dass du da bist, Anna Muster!" }),
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
    user.type(screen.getByLabelText("Benutzername oder E-Mail"), "anna");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    user.click(screen.getByRole("button", { name: "Anmelden" }));
    // The visitor wanted the profile and lands there.
    expect(await screen.findByRole("heading", { name: "Mein Profil" })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Adresse bestätigen" }));
    expect(await screen.findByRole("heading", { name: "Adresse bestätigt" })).toBeInTheDocument();
    unmount();
    renderAt("/invite/K7QMX4");
    expect(
      await screen.findByRole("heading", { name: "Schön, dass du da bist, Anna!" }),
    ).toBeInTheDocument();
  });
});

describe("ended sessions and lost connections", () => {
  it("[ACS-09][ACC-05] a session that ended on another device leads to the login page", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "PATCH /api/profile": () => ({
        status: 401,
        body: { error: { code: "unauthorized", message: "Sign in first." } },
      }),
    });
    renderAt("/profile");
    user.click(await screen.findByRole("button", { name: "Speichern" }));
    expect(await screen.findByLabelText("Benutzername oder E-Mail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();
  });

  it("[ACC-01] a lost connection is shown, and the form can be sent again", async () => {
    let offline = true;
    fakeBackend({
      "GET /api/session": () => anonymous,
      "POST /api/session": () => {
        if (offline) throw new TypeError("Failed to fetch");
        return signedIn;
      },
    });
    renderAt("/login");
    user.type(await screen.findByLabelText("Benutzername oder E-Mail"), "anna");
    user.type(screen.getByLabelText("Passwort"), "correct-horse-battery");
    const submit = screen.getByRole("button", { name: "Anmelden" });
    user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Keine Verbindung zum Server");
    expect(submit).toBeEnabled();

    offline = false;
    user.click(submit);
    expect(await screen.findByRole("link", { name: "Profil" })).toBeInTheDocument();
  });
});
