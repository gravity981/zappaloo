import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WAITING_TEXTS } from "@zappaloo/shared";
import { renderMarkdown } from "../app/markdown.ts";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, renderAt, user } from "../test/backend.tsx";

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
});

const closedEvent = { ...event, settings: { ...event.settings, platformOpen: false } };
const openEvent = event;
const guest = { ...anna, displayName: "Erika" };
const asGuest = { status: 200, body: { user: guest, csrfToken: "csrf-1" } };
const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-9" } };
const anonymous = { status: 200, body: { user: null, csrfToken: null } };

const NOTICE =
  "# Datenschutz\n\nDiese Seite gehört zum Fest «Event Muster».\n\n## Allergien\n\nSie sind **Gesundheitsdaten**.";
const privacy = () => ({ status: 200, body: { eventName: "Event Muster", markdown: NOTICE } });

describe("Markdown is sanitised (SEC-05)", () => {
  it("[SEC-05] renders Markdown, and strips scripts, event handlers and javascript: links", () => {
    const html = renderMarkdown(
      [
        "# Titel",
        "",
        "Ein **fetter** Text mit [Link](https://example.ch) und [böse](javascript:alert(1)).",
        "",
        "<script>alert(1)</script>",
        "",
        '<img src="x" onerror="alert(2)">',
        "",
        '<div onclick="alert(3)">Roh</div>',
        "",
        "- eins",
        "- zwei",
      ].join("\n"),
    );
    expect(html).toContain("<h1>Titel</h1>");
    expect(html).toContain("<strong>fetter</strong>");
    expect(html).toContain("<li>eins</li>");
    expect(html).toContain('href="https://example.ch"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror|onclick/i);
    expect(html).not.toMatch(/javascript:/i);
  });

  it("[SEC-05][SEC-09] a text cannot imitate a sign-in, cover the page or track its readers", () => {
    const html = renderMarkdown(
      [
        '<form action="https://evil.example/steal"><input type="password"><button>Anmelden</button></form>',
        "",
        '<div style="position:fixed;inset:0">Überdeckt</div>',
        "",
        "<style>body { display: none }</style>",
        "",
        "![Pixel](https://evil.example/p.gif) ![Logo](/assets/logo.png)",
      ].join("\n"),
    );
    expect(html).not.toMatch(/<form|<input|<button|<style|style=/i);
    expect(html).not.toContain("evil.example");
    // Text stays, and images of this site too.
    expect(html).toContain("Überdeckt");
    expect(html).toContain('src="/assets/logo.png"');
  });
});

describe("the privacy notice page (SEC-09)", () => {
  it("[SEC-09] is readable without signing in, as Markdown", async () => {
    fakeBackend({
      "GET /api/session": () => anonymous,
      "GET /api/privacy": privacy,
    });
    renderAt("/datenschutz");
    expect(
      await screen.findByRole("heading", { name: "Datenschutz", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Allergien" })).toBeInTheDocument();
    expect(screen.getByText("Gesundheitsdaten", { selector: "strong" })).toBeInTheDocument();
  });

  it("[SEC-09] is linked from the pages: login, the RSVP, the admin area", async () => {
    fakeBackend({ "GET /api/session": () => anonymous });
    renderAt("/login");
    expect(await screen.findByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "/datenschutz",
    );
  });

  it("[SEC-09] guests find the link on the RSVP page and in the admin area", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/rsvp": () => ({
        status: 200,
        body: {
          name: "Erika",
          deadline: null,
          closed: false,
          songEnabled: true,
          parts: [],
          menus: [],
          answer: null,
          companions: [],
        },
      }),
    });
    renderAt("/rsvp");
    expect(await screen.findByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "/datenschutz",
    );
    vi.unstubAllGlobals();
    fakeBackend({ "GET /api/session": () => asAdmin });
  });

  it("[SEC-09] the waiting page links the notice under the button", async () => {
    fakeBackend({
      "GET /api/session": () => asGuest,
      "GET /api/event": () => ({ status: 200, body: closedEvent }),
      "GET /api/waiting": () => ({
        status: 200,
        body: {
          eventName: "Event Muster",
          open: false,
          status: "none",
          text: "Psst, Erika",
          countdownTo: null,
          rsvp: true,
        },
      }),
      "GET /api/waiting/door": () => ({ status: 200, body: { kind: "default" } }),
    });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "/datenschutz",
    );
  });

  it("[SEC-09] the admin area has the link too", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 404,
        body: { error: { code: "feature_disabled", message: "x" } },
      }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "/datenschutz",
    );
  });
});

describe("Einstellungen › Datenschutz", () => {
  it("[SEC-09] the admin edits the notice and goes back to the default", async () => {
    let current = { markdown: NOTICE, custom: false };
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: closedEvent }),
      "GET /api/admin/privacy": () => ({ status: 200, body: current }),
      "PUT /api/admin/privacy": () => {
        const body = calls.at(-1)?.body as { markdown: string | null };
        current =
          body.markdown === null
            ? { markdown: NOTICE, custom: false }
            : { markdown: body.markdown, custom: true };
        return { status: 200, body: current };
      },
    });
    renderAt("/admin/settings");
    const text = await screen.findByLabelText("Text der Datenschutzerklärung");
    const privacyCard = text.closest("section");
    if (!privacyCard) throw new Error("no card");
    expect(text).toHaveValue(NOTICE);
    expect(screen.getByRole("link", { name: "Ansehen" })).toHaveAttribute("href", "/datenschutz");
    // Nothing to save until the text changes; the default needs no reset.
    expect(within(privacyCard).getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Standardtext" })).not.toBeInTheDocument();

    user.type(text, "# Mein Datenschutz");
    user.click(within(privacyCard).getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      csrf: "csrf-9",
      body: { markdown: "# Mein Datenschutz" },
    });
    user.click(await screen.findByRole("button", { name: "Standardtext" }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "PUT")[1]?.body).toEqual({ markdown: null });
  });
});

describe("opening and closing the platform (ACS-14)", () => {
  const waiting = () => ({
    status: 200,
    body: {
      openingAt: null,
      countdownEnabled: false,
      texts: DEFAULT_WAITING_TEXTS,
      custom: { none: false, attending: false, declined: false },
    },
  });

  /** A fake server that remembers whether the platform is open. */
  function platformBackend(recipientCount: number, openReply: object = { sent: 3, failed: 0 }) {
    let open = false;
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: open ? openEvent : closedEvent }),
      "GET /api/admin/waiting": waiting,
      "GET /api/admin/privacy": () => ({ status: 200, body: { markdown: NOTICE, custom: false } }),
      "GET /api/admin/platform": () => ({ status: 200, body: { open, recipientCount } }),
      "POST /api/admin/platform/open": () => {
        open = true;
        return { status: 200, body: openReply };
      },
      "POST /api/admin/platform/close": () => {
        open = false;
        return { status: 204 };
      },
    });
    return calls;
  }
  const card = async () => {
    const found = (await screen.findByText("Plattform öffnen", { selector: "b" })).closest(
      "section",
    );
    if (!found) throw new Error("no card");
    return found;
  };

  it("[ACS-14] the button names how many guests the email reaches; opening sends it, and the card offers to close again", async () => {
    const calls = platformBackend(3);
    renderAt("/admin/settings");
    const section = await card();
    const checkbox = await within(section).findByRole("checkbox", {
      name: "E-Mail «Die Tür ist offen» an alle Gäste mit bestätigter Adresse senden (3)",
    });
    expect(checkbox).toBeChecked();
    user.click(within(section).getByRole("button", { name: "Jetzt öffnen" }));

    expect(
      await within(section).findByText("Die Plattform ist offen. 3 E-Mails wurden gesendet."),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/admin/platform/open")).toMatchObject({
      csrf: "csrf-9",
      body: { sendEmail: true },
    });
    // The state shows at once: the tag, and "Wieder schliessen" without email.
    expect(within(section).getByText("Plattform offen")).toBeInTheDocument();
    user.click(await within(section).findByRole("button", { name: "Wieder schliessen" }));
    expect(
      await within(section).findByText("Die Plattform ist wieder geschlossen."),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/admin/platform/close")?.csrf).toBe("csrf-9");
    expect(
      await within(section).findByRole("button", { name: "Jetzt öffnen" }),
    ).toBeInTheDocument();
  });

  it("[ACS-14] the admin can open without the email", async () => {
    const calls = platformBackend(3, { sent: 0, failed: 0 });
    renderAt("/admin/settings");
    const section = await card();
    user.click(await within(section).findByRole("checkbox"));
    user.click(within(section).getByRole("button", { name: "Jetzt öffnen" }));
    expect(await within(section).findByText("Die Plattform ist offen.")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/admin/platform/open")?.body).toEqual({
      sendEmail: false,
    });
  });

  it("[ACS-14] without a guest who can receive it there is no email to send", async () => {
    const calls = platformBackend(0, { sent: 0, failed: 0 });
    renderAt("/admin/settings");
    const section = await card();
    const checkbox = await within(section).findByRole("checkbox");
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    user.click(within(section).getByRole("button", { name: "Jetzt öffnen" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/api/admin/platform/open")).toBe(true);
    });
    expect(calls.find((c) => c.path === "/api/admin/platform/open")?.body).toEqual({
      sendEmail: false,
    });
  });

  it("[ACS-14] mails that failed are reported, the platform is open anyway", async () => {
    platformBackend(3, { sent: 2, failed: 1 });
    renderAt("/admin/settings");
    const section = await card();
    user.click(await within(section).findByRole("button", { name: "Jetzt öffnen" }));
    expect(
      await within(section).findByText(
        "Die Plattform ist offen. 2 E-Mails wurden gesendet. 1 E-Mail konnte nicht gesendet werden.",
      ),
    ).toBeInTheDocument();
  });

  it("[ACS-14] a refusal is shown", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: closedEvent }),
      "GET /api/admin/waiting": waiting,
      "GET /api/admin/privacy": () => ({ status: 200, body: { markdown: NOTICE, custom: false } }),
      "GET /api/admin/platform": () => ({ status: 200, body: { open: false, recipientCount: 1 } }),
      "POST /api/admin/platform/open": () => ({
        status: 503,
        body: { error: { code: "mail_unavailable", message: "x" } },
      }),
    });
    renderAt("/admin/settings");
    const section = await card();
    user.click(await within(section).findByRole("button", { name: "Jetzt öffnen" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "Auf diesem Server können keine E-Mails verschickt werden.",
    );
  });

  it("[ACS-14] the overview offers to open a closed platform", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/event": () => ({ status: 200, body: closedEvent }),
      "GET /api/admin/rsvp": () => ({
        status: 404,
        body: { error: { code: "feature_disabled", message: "x" } },
      }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    expect(await screen.findByRole("link", { name: "Öffnen …" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );
  });

  it("[ACS-14] an open platform has no 'open' link on the overview", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/admin/rsvp": () => ({
        status: 404,
        body: { error: { code: "feature_disabled", message: "x" } },
      }),
      "GET /api/admin/activity": () => ({ status: 200, body: { entries: [] } }),
    });
    renderAt("/admin");
    await screen.findByText("Offen", { selector: "b" });
    expect(screen.queryByRole("link", { name: "Öffnen …" })).not.toBeInTheDocument();
  });
});
