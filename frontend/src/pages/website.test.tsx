import { readFileSync } from "node:fs";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, signedIn, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };

/** The published website as `GET /api/content` answers it. */
const site = {
  startMarkdown: "Willkommen!",
  pages: [
    {
      id: 1,
      slug: "anreise",
      title: "Anreise & Parkieren",
      markdown: "# Anreise\n\nMit dem Zug.",
      inMore: true,
      position: 0,
      placeIds: [5],
    },
    { id: 2, slug: "faq", title: "FAQ", markdown: "", inMore: false, position: 1, placeIds: [] },
  ],
  places: [
    {
      id: 5,
      name: "Kirche Muri",
      address: "Kirchstrasse 1",
      mapsUrl: "https://maps.app.goo.gl/Kirche",
      mapImageId: 9,
    },
  ],
  start: { heroImageId: 7, heroAlt: "Das Paar vor der Kirche", countdown: true },
};

const countdownOf = (days: number) => ({
  countdown: { days, date: "2027-06-12", placeName: "Kirche Muri" },
  eventDay: false,
  eventDate: "2027-06-12",
  now: null,
  next: null,
});

describe("the start page (WEB-10, WEB-11)", () => {
  it("shows the hero with its alt text, the welcome text, the countdown and the shortcuts to the pages in Mehr", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({ status: 200, body: countdownOf(3) }),
    });
    renderAt("/");
    expect(await screen.findByAltText("Das Paar vor der Kirche")).toBeInTheDocument();
    expect(screen.getByText("Willkommen!")).toBeInTheDocument();
    expect(screen.getByText("3 Tage")).toBeInTheDocument();
    expect(screen.getByText(/Sa\., 12\. Juni 2027 · Kirche Muri/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Anreise & Parkieren" })).toHaveAttribute(
      "href",
      "/p/anreise",
    );
    // A page that is not listed under Mehr is reached by its address only.
    expect(screen.queryByRole("link", { name: "FAQ" })).not.toBeInTheDocument();
  });

  it("[WEB-11] says 'Noch 1 Tag' the day before, in the singular", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({ status: 200, body: countdownOf(1) }),
    });
    renderAt("/");
    expect(await screen.findByText("1 Tag")).toBeInTheDocument();
  });

  it("[WEB-11] has no countdown card when the server gives none (switch off, no program items)", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({
        status: 200,
        body: { countdown: null, eventDay: false, eventDate: null, now: null, next: null },
      }),
    });
    renderAt("/");
    expect(await screen.findByText("Willkommen!")).toBeInTheDocument();
    expect(screen.queryByText(/^Noch$/)).not.toBeInTheDocument();
  });

  it("the start page editor sets the hero image with its alt text and the countdown switch", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/content/images?item=start": () => ({
        status: 200,
        body: {
          images: [
            { id: 7, mime: "image/jpeg", bytes: 2048, createdAt: "2027-01-01T10:00:00.000Z" },
          ],
        },
      }),
      "PUT /api/content/start": () => ({ status: 200, body: site }),
    });
    renderAt("/admin/content/pages/start");
    user.type(await screen.findByLabelText("Beschreibung (Alt-Text)"), "Das Paar");
    user.type(screen.getByLabelText("Bild wählen"), "7");
    user.click(screen.getByRole("switch", { name: "Countdown auf der Startseite zeigen" }));
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    await vi.waitFor(() => {
      expect(
        calls.some((call) => call.method === "PUT" && call.path === "/api/content/start"),
      ).toBe(true);
    });
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
      markdown: "Willkommen!",
      heroImageId: 7,
      heroAlt: "Das Paar",
      countdown: false,
    });
  });
});

describe("the content page and Mehr (WEB-02, WEB-05, CNT-07)", () => {
  it("[WEB-02][CNT-07] a page shows its text and its places as cards, with the map link in a new tab", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
    });
    renderAt("/p/anreise");
    expect(await screen.findByRole("heading", { name: "Anreise & Parkieren" })).toBeInTheDocument();
    expect(screen.getByText("Mit dem Zug.")).toBeInTheDocument();
    expect(screen.getByText("Kirchstrasse 1")).toBeInTheDocument();
    expect(screen.getByAltText("Karte von Kirche Muri")).toHaveAttribute(
      "src",
      "/api/content/images/9",
    );
    const link = screen.getByRole("link", { name: "In Google Maps öffnen" });
    expect(link).toHaveAttribute("href", "https://maps.app.goo.gl/Kirche");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("[WEB-02] Mehr lists the visible pages and the profile; the admin entries only for those who may use them", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
    });
    renderAt("/mehr");
    expect(await screen.findByRole("link", { name: "Anreise & Parkieren" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "FAQ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mein Profil" })).toHaveAttribute("href", "/profile");
    expect(screen.queryByRole("link", { name: /Verwaltung/ })).not.toBeInTheDocument();
    // Datenschutz is in the footer, Abmelden in the profile: neither is on this page.
    expect(screen.queryByRole("button", { name: "Abmelden" })).not.toBeInTheDocument();
  });

  it("[WEB-02] an admin sees Verwaltung and Inhalte in Mehr", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: site }),
    });
    renderAt("/mehr");
    expect(await screen.findByRole("link", { name: /Verwaltung/ })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("link", { name: "Inhalte" })).toHaveAttribute("href", "/admin/content");
  });
});

describe("the website frame (WEB-04, WEB-01)", () => {
  it("[WEB-04] the navigation has Start and Mehr; on a phone it is the bottom tab bar", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
    });
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Website" });
    expect(within(nav).getByRole("link", { name: "Start" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Mehr" })).toHaveAttribute("href", "/mehr");
  });

  it("[WEB-01] the website files do not load Phaser or the game", () => {
    const files = [
      "../app/Layout.tsx",
      "../app/Markdown.tsx",
      "../app/useApi.ts",
      "../pages/HomePage.tsx",
      "../pages/ContentPage.tsx",
      "../pages/MorePage.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/phaser|\.\.\/game\//i);
    }
  });
});

describe("the schedule (WEB-07, WEB-09, WEB-10)", () => {
  const programme = {
    hidden: true,
    eventDay: true,
    eventDate: "2027-06-12",
    items: [
      {
        id: 1,
        name: "Trauung",
        startsAt: "2027-06-12T10:00:00.000Z",
        endsAt: "2027-06-12T10:45:00.000Z",
        placeName: "Kirche Muri",
        status: "past",
      },
      {
        id: 2,
        name: "Apéro",
        startsAt: "2027-06-12T11:30:00.000Z",
        endsAt: null,
        placeName: "Schlossgarten",
        status: "now",
      },
      {
        id: 3,
        name: "Dinner",
        startsAt: "2027-06-12T14:30:00.000Z",
        endsAt: null,
        placeName: "Landgasthof Linde",
        status: "upcoming",
      },
    ],
  };

  it("[WEB-09] the programme shows only the invited items, with one line that says so, and greys out the past", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    renderAt("/programme");
    expect(
      await screen.findByText("Du siehst nur die Programmpunkte, zu denen du eingeladen bist."),
    ).toBeInTheDocument();
    const past = screen.getByText("Trauung").closest("li");
    expect(past).toHaveClass("past");
    expect(screen.getByText("Apéro").closest("li")).toHaveClass("now");
    expect(screen.getByText("Jetzt")).toBeInTheDocument();
    expect(screen.getByText("Dinner").closest("li")).toHaveClass("upcoming");
    // "Hingehen" comes with stage 5.
    expect(screen.queryByRole("button", { name: "Hingehen" })).not.toBeInTheDocument();
  });

  it("[WEB-09] without hidden items the programme has no line about invitations", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: { ...programme, hidden: false } }),
    });
    renderAt("/programme");
    expect(await screen.findByText("Trauung")).toBeInTheDocument();
    expect(
      screen.queryByText("Du siehst nur die Programmpunkte, zu denen du eingeladen bist."),
    ).not.toBeInTheDocument();
  });

  it("[WEB-09] a guest without invitations gets a line that says so", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: { ...programme, items: [] } }),
    });
    renderAt("/programme");
    expect(
      await screen.findByText("Für dich sind noch keine Programmpunkte festgelegt."),
    ).toBeInTheDocument();
  });

  it("[WEB-07][WEB-10] on the event day the start page shows now and next, and no countdown, hero or welcome text", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({
        status: 200,
        body: {
          countdown: null,
          eventDay: true,
          eventDate: "2027-06-12",
          now: {
            id: 2,
            name: "Apéro",
            startsAt: "2027-06-12T11:30:00.000Z",
            endsAt: null,
            placeName: "Schlossgarten",
          },
          next: {
            id: 3,
            name: "Dinner",
            startsAt: "2027-06-12T14:30:00.000Z",
            endsAt: null,
            placeName: "Landgasthof Linde",
          },
        },
      }),
    });
    renderAt("/");
    expect(await screen.findByText("Jetzt")).toBeInTheDocument();
    expect(screen.getByText("Apéro")).toBeInTheDocument();
    expect(screen.getByText("Danach")).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.queryByAltText("Das Paar vor der Kirche")).not.toBeInTheDocument();
    expect(screen.queryByText("Willkommen!")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Noch$/)).not.toBeInTheDocument();
    const shortcuts = screen.getByRole("navigation", { name: "Abkürzungen" });
    expect(within(shortcuts).getByRole("link", { name: "Programm" })).toHaveAttribute(
      "href",
      "/programme",
    );
  });

  it("[WEB-07] the header shows the event's date, and the navigation has Start, Programm and Mehr", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({
        status: 200,
        body: { countdown: null, eventDay: false, eventDate: "2027-06-12", now: null, next: null },
      }),
    });
    renderAt("/");
    expect(await screen.findByText(/Sa\., 12\. Juni 2027/)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Website" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Start", "Programm", "Mehr"]);
  });
});
