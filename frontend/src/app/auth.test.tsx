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
