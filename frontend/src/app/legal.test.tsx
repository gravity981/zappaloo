// The footer's copyright and license notice, the license page and the admin's line
// (LIC-01 – LIC-03; sw-architecture.md 19.6, UX decision 61).
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { resetSiteNameCache } from "../guest/site.ts";
import { anna, anonymous, event, fakeBackend, renderAt, SITE, user } from "../test/backend.tsx";

/** The nearest ancestor with this tag; the test fails if there is none. */
function ancestor(element: HTMLElement, tag: string): HTMLElement {
  const found = element.closest<HTMLElement>(tag);
  if (!found) throw new Error(`no <${tag}> around the element`);
  return found;
}

const LICENSE_TEXT = "GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007\n…";

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSiteNameCache();
});

const site =
  (copyright: string | null = SITE.copyright) =>
  () => ({
    status: 200,
    body: { ...SITE, copyright },
  });
const license = () => ({ status: 200, body: { text: LICENSE_TEXT } });
const asGuest = () => ({
  status: 200,
  body: { user: { ...anna, displayName: "Erika" }, csrfToken: "csrf-1" },
});
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = () => ({ status: 200, body: { user: admin, csrfToken: "csrf-9" } });

describe("the notice under the footer", () => {
  it("[LIC-01] shows the copyright line, the license sentence and the two links, without a sign-in", async () => {
    fakeBackend({ "GET /api/session": () => anonymous, "GET /api/site": site() });
    renderAt("/login");
    expect(await screen.findByText("© 2027 Lea & Jonas")).toBeVisible();
    expect(
      screen.getByText(
        "Dieses Projekt ist freie Software unter der GNU Affero General Public License v3.0 (AGPL-3.0).",
      ),
    ).toBeVisible();
    const source = screen.getByRole("link", { name: "Quellcode" });
    expect(source).toHaveAttribute("href", SITE.sourceUrl);
    // The repository opens in a new tab and gets no handle on this page.
    expect(source).toHaveAttribute("target", "_blank");
    expect(source.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: "Lizenz" })).toHaveAttribute("href", "/license");
  });

  it("[LIC-01][LIC-02] a hidden copyright line leaves the license sentence and the links", async () => {
    fakeBackend({ "GET /api/session": () => anonymous, "GET /api/site": site(null) });
    renderAt("/login");
    expect(await screen.findByRole("link", { name: "Quellcode" })).toBeVisible();
    expect(screen.queryByText(/©/)).not.toBeInTheDocument();
  });

  it('[LIC-01] comes below "Datenschutz" on the pages of a signed-in guest', async () => {
    fakeBackend({
      "GET /api/session": asGuest,
      "GET /api/site": site(),
      "GET /api/event": () => ({ status: 200, body: event }),
    });
    renderAt("/profile");
    const line = await screen.findByText("© 2027 Lea & Jonas");
    const footer = ancestor(line, "footer");
    expect(within(footer).getByRole("link", { name: "Datenschutz" })).toBeVisible();
    expect(within(footer).getByText(/Version/)).toBeVisible();
  });

  it("[LIC-01] is in the admin area too", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/site": site(),
      "GET /api/event": () => ({ status: 200, body: event }),
    });
    renderAt("/admin");
    expect(await screen.findByText("© 2027 Lea & Jonas")).toBeVisible();
  });

  it("[LIC-01] is not on the waiting page, a scene with its own Datenschutz link", async () => {
    fakeBackend({
      "GET /api/session": asGuest,
      "GET /api/site": site(),
      "GET /api/event": () => ({
        status: 200,
        body: { ...event, settings: { ...event.settings, platformOpen: false } },
      }),
      "GET /api/waiting": () => ({
        status: 200,
        body: {
          eventName: "Lea & Jonas",
          open: false,
          status: "none",
          text: "Psst, Erika.",
          countdownTo: null,
          rsvp: true,
        },
      }),
      "GET /api/waiting/door": () => ({ status: 200, body: { kind: "default" } }),
    });
    renderAt("/");
    await screen.findByText("Psst, Erika.");
    expect(screen.queryByRole("link", { name: "Quellcode" })).not.toBeInTheDocument();
    expect(screen.queryByText(/©/)).not.toBeInTheDocument();
  });

  it("[LIC-01] shows nothing, and breaks nothing, if the texts cannot be read", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/login");
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Quellcode" })).not.toBeInTheDocument();
  });
});

describe("the license page", () => {
  it("[LIC-03] is public and shows the license text of the running version", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/site": site(),
      "GET /api/license": license,
    });
    renderAt("/license");
    expect(await screen.findByRole("heading", { name: "Lizenz" })).toBeVisible();
    expect(await screen.findByText(/GNU AFFERO GENERAL PUBLIC LICENSE/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Quellcode ansehen" })).toHaveAttribute(
      "href",
      SITE.sourceUrl,
    );
    expect(screen.getByRole("link", { name: "Zurück" })).toBeVisible();
  });

  it('[LIC-03] "Lizenz" in the footer leads there', async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/site": site(),
      "GET /api/license": license,
    });
    renderAt("/login");
    user.click(await screen.findByRole("link", { name: "Lizenz" }));
    expect(await screen.findByText(/GNU AFFERO GENERAL PUBLIC LICENSE/)).toBeVisible();
  });
});

describe("the card Fusszeile in Einstellungen", () => {
  function footerBackend(config: { copyright: string; custom: boolean }) {
    let current = config;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/site": site(),
      "GET /api/event": () => ({ status: 200, body: event }),
      "GET /api/admin/footer": () => ({
        status: 200,
        body: { ...current, defaultCopyright: "© 2027 Event Muster" },
      }),
      "PUT /api/admin/footer": () => {
        const body = calls.findLast((call) => call.method === "PUT")?.body as {
          copyright: string | null;
        };
        current =
          body.copyright === null
            ? { copyright: "© 2027 Event Muster", custom: false }
            : { copyright: body.copyright, custom: true };
        return { status: 200, body: { ...current, defaultCopyright: "© 2027 Event Muster" } };
      },
    });
    return calls;
  }

  it("[LIC-02] the admin edits the line, sees a preview and saves it", async () => {
    const calls = footerBackend({ copyright: "© 2027 Event Muster", custom: false });
    renderAt("/admin/settings");
    const card = ancestor(await screen.findByText("Fusszeile"), "section");
    const field = within(card).getByLabelText(/Copyright-Zeile/);
    expect(field).toHaveValue("© 2027 Event Muster");
    expect(field).toHaveAttribute("maxlength", "120");
    // Nothing to save, nothing to reset, before a change.
    expect(within(card).getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(within(card).queryByRole("button", { name: "Zurücksetzen" })).not.toBeInTheDocument();

    user.type(field, "© 2027 Lea & Jonas. Alle Rechte vorbehalten.");
    // The preview shows the new line right away, below the fixed parts.
    expect(
      within(card).getByText("© 2027 Lea & Jonas. Alle Rechte vorbehalten."),
    ).toBeInTheDocument();
    user.click(within(card).getByRole("button", { name: "Speichern" }));
    expect(await within(card).findByRole("status")).toHaveTextContent("Gespeichert.");
    expect(calls.findLast((call) => call.method === "PUT")).toMatchObject({
      path: "/api/admin/footer",
      body: { copyright: "© 2027 Lea & Jonas. Alle Rechte vorbehalten." },
      csrf: "csrf-9",
    });
    expect(await within(card).findByRole("button", { name: "Zurücksetzen" })).toBeVisible();
  });

  it("[LIC-02] an empty line hides it: the preview has no copyright line", async () => {
    const calls = footerBackend({ copyright: "© 2027 Event Muster", custom: false });
    renderAt("/admin/settings");
    const card = ancestor(await screen.findByText("Fusszeile"), "section");
    user.clear(within(card).getByLabelText(/Copyright-Zeile/));
    expect(within(card).queryByText(/©/)).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Quellcode" })).toBeVisible();
    user.click(within(card).getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(calls.findLast((call) => call.method === "PUT")?.body).toEqual({ copyright: "" });
    });
  });

  it('[LIC-02] "Zurücksetzen" goes back to the default', async () => {
    const calls = footerBackend({ copyright: "Eigene Zeile", custom: true });
    renderAt("/admin/settings");
    const card = ancestor(await screen.findByText("Fusszeile"), "section");
    user.click(await within(card).findByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() => {
      expect(calls.findLast((call) => call.method === "PUT")?.body).toEqual({ copyright: null });
    });
    await waitFor(() => {
      expect(within(card).getByLabelText(/Copyright-Zeile/)).toHaveValue("© 2027 Event Muster");
    });
  });
});
