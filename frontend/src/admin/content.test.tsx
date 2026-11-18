import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { resetSiteNameCache } from "../guest/site.ts";
import { anna, fakeBackend, renderAt, SITE, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = { status: 200, body: { user: admin, csrfToken: "csrf-1" } };

const editor = {
  ...anna,
  id: 10,
  username: "ben",
  displayName: "Ben",
  roles: ["staff"],
  capabilities: ["editWebsiteContent"],
};
const asEditor = { status: 200, body: { user: editor, csrfToken: "csrf-2" } };

const place = {
  id: 3,
  name: "Kirche Muri",
  address: "Kirchstrasse 1",
  mapsUrl: null,
  mapImageId: null,
};

/** The content as `GET /api/content` answers it: the start text, the pages in order, the places. */
const content = {
  startMarkdown: "Willkommen!",
  start: { heroImageId: null, heroAlt: null, countdown: true },
  pages: [
    {
      id: 1,
      slug: "das-fest",
      title: "Das Fest",
      markdown: "# Das Fest",
      inMore: true,
      position: 0,
      placeIds: [],
    },
    { id: 2, slug: "faq", title: "FAQ", markdown: "", inMore: false, position: 1, placeIds: [] },
  ],
  places: [],
};

/** The event's theme as `GET /api/site` carries it: a heading font at 125 %, a body font, an accent. */
const THEME = {
  version: "import-1",
  colors: {
    background: "#f9f0e5",
    surface: "#fffaf4",
    text: "#251e15",
    muted: "#6d6152",
    line: "#dfd4c5",
    accent: "#2f4f79",
    onAccent: "#ffffff",
  },
  fonts: {
    heading: {
      family: "Birds of Paradise",
      sizeAdjust: 125,
      files: [{ url: "/theme/fonts/birds.woff2?v=import-1", weight: 600, style: "normal" }],
    },
    body: {
      family: "Lora",
      files: [{ url: "/theme/fonts/lora.woff2?v=import-1", weight: 400, style: "normal" }],
    },
  },
};

describe("the preview of the content editor carries the theme (CNT-05, THM-01, THM-06)", () => {
  const previewOf = () => {
    const preview = document.querySelector<HTMLElement>(".themed-preview");
    const themed = preview?.closest<HTMLElement>(".themed");
    if (!preview || !themed) throw new Error("no themed preview");
    return { preview, themed };
  };
  const editPage = (theme: unknown) => {
    resetSiteNameCache();
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "GET /api/content/images?item=page-1": () => ({ status: 200, body: { images: [] } }),
      "GET /api/site": () => ({ status: 200, body: { ...SITE, theme } }),
    });
    renderAt("/admin/content/pages/1");
  };

  it("[CNT-05][THM-01] the preview of a page has the theme's colours and font faces, like the website", async () => {
    editPage(THEME);
    await screen.findByLabelText("Titel");
    await waitFor(() => {
      expect(previewOf().themed.style.getPropertyValue("--a-dark")).toBe("#2f4f79");
    });
    const { themed, preview } = previewOf();
    expect(themed.style.getPropertyValue("--a-bg")).toBe("#f9f0e5");
    expect(themed.style.getPropertyValue("--a-display")).toContain("Birds of Paradise");
    expect(themed.style.getPropertyValue("--a-body-font")).toContain("Lora");
    const faces = themed.querySelector("style")?.textContent ?? "";
    expect(faces).toContain('font-family: "Birds of Paradise"');
    expect(faces).toContain("size-adjust: 125%;");
    // it is the guest's view: the markdown of the page is inside the guest frame of the website
    expect(within(preview).getAllByRole("heading", { name: "Das Fest", level: 1 })).toHaveLength(2);
  });

  it("[CNT-05][THM-06] the page title is shown above the text in the heading style, and follows the field", async () => {
    editPage(THEME);
    const title = await screen.findByLabelText("Titel");
    await waitFor(() => {
      expect(document.querySelector(".themed-preview")).not.toBeNull();
    });
    const { preview } = previewOf();
    // the title "Das Fest" and the text's own "# Das Fest" are two headings
    const headings = within(preview).getAllByRole("heading", { name: "Das Fest" });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveClass("h1");
    expect(headings[0]?.closest(".markdown")).toBeNull();
    expect(headings[1]?.closest(".markdown")).not.toBeNull();
    fireEvent.change(title, { target: { value: "Neuer Titel" } });
    expect(within(preview).getByRole("heading", { name: "Neuer Titel" })).toHaveClass("h1");
  });

  it("[CNT-05] without a theme the preview is still the guest's view, with the platform's look", async () => {
    editPage(null);
    await screen.findByLabelText("Titel");
    await waitFor(() => {
      expect(document.querySelector(".themed-preview")).not.toBeNull();
    });
    const { themed } = previewOf();
    expect(themed.getAttribute("style") ?? "").toBe("");
    expect(themed.querySelector("style")).toBeNull();
  });

  it("[CNT-05] the Startseite's preview shows the text only: it has no title", async () => {
    resetSiteNameCache();
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "GET /api/content/images?item=start": () => ({ status: 200, body: { images: [] } }),
      "GET /api/site": () => ({ status: 200, body: { ...SITE, theme: THEME } }),
    });
    renderAt("/admin/content/pages/start");
    await screen.findByLabelText("Begrüssungstext der Startseite");
    await waitFor(() => {
      expect(previewOf().themed.style.getPropertyValue("--a-dark")).toBe("#2f4f79");
    });
    expect(previewOf().preview.querySelector(":scope > h1")).toBeNull();
    expect(previewOf().preview.querySelector(".markdown")).not.toBeNull();
  });
});

describe("the content editor", () => {
  it("[CNT-05] an admin changes the start page text and sees the preview", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "GET /api/content/images?item=start": () => ({ status: 200, body: { images: [] } }),
      "PUT /api/content/start": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content/pages/start");
    const field = await screen.findByLabelText("Begrüssungstext der Startseite");
    expect(field).toHaveValue("Willkommen!");
    user.type(field, "# Hallo\n\nSchön, dass du da bist.");
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Veröffentlicht.");
    const put = calls.find((call) => call.method === "PUT" && call.path === "/api/content/start");
    expect(put?.body).toEqual({
      markdown: "# Hallo\n\nSchön, dass du da bist.",
      heroImageId: null,
      heroAlt: null,
      countdown: true,
    });
    expect(put?.csrf).toBe("csrf-1");
    expect(screen.getByRole("heading", { name: "Hallo" })).toBeInTheDocument();
  });

  it("[CNT-05][WEB-03] an admin creates a page; its address follows the title until it is typed over", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "POST /api/content/pages": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("button", { name: "+ Seite" }));
    user.type(await screen.findByLabelText("Titel"), "Anreise & Parkieren");
    expect(screen.getByLabelText("Adresse")).toHaveValue("anreise-parkieren");
    user.type(screen.getByLabelText("Text (Markdown)"), "Mit dem Zug.");
    user.click(screen.getByRole("switch", { name: "In «Mehr» sichtbar" }));
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === "POST")).toBe(true);
    });
    const post = calls.find((call) => call.method === "POST");
    expect(post?.path).toBe("/api/content/pages");
    expect(post?.body).toEqual({
      slug: "anreise-parkieren",
      title: "Anreise & Parkieren",
      markdown: "Mit dem Zug.",
      inMore: false,
      placeIds: [],
    });
  });

  it("[CNT-05] pages move up and down on the list; the server takes the whole new order", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "PUT /api/content/order": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content");
    const down = await screen.findAllByRole("button", { name: "Nach unten" });
    const first = down[0];
    if (!first) throw new Error("no move button");
    user.click(first);
    await waitFor(() => {
      expect(calls.some((call) => call.path === "/api/content/order")).toBe(true);
    });
    expect(calls.find((call) => call.path === "/api/content/order")?.body).toEqual({
      ids: [2, 1],
    });
  });

  it("[ROLE-06] staff with editWebsiteContent get the editor and no other admin page", async () => {
    fakeBackend({
      "GET /api/session": () => asEditor,
      "GET /api/content": () => ({ status: 200, body: content }),
    });
    renderAt("/admin");
    const nav = await screen.findByRole("navigation", { name: "Verwaltung" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Inhalte"]);
    expect(await screen.findByRole("heading", { name: "Inhalte" })).toBeInTheDocument();
  });

  it("[ROLE-06] staff without the capability are sent to the start page", async () => {
    fakeBackend({
      "GET /api/session": () => ({
        status: 200,
        body: { user: { ...editor, capabilities: [] }, csrfToken: "csrf-3" },
      }),
    });
    renderAt("/admin/content");
    expect(await screen.findByText("Willkommen!")).toBeInTheDocument();
  });
});

describe("places and images of the content editor", () => {
  it("[CNT-06] an admin uploads an image to the start page and gets the Markdown that shows it", async () => {
    let images: unknown[] = [];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "GET /api/content/images?item=start": () => ({ status: 200, body: { images } }),
      "POST /api/content/images?item=start": () => {
        images = [
          { id: 5, mime: "image/jpeg", bytes: 2048, createdAt: "2027-01-01T10:00:00.000Z" },
        ];
        return { status: 200, body: { image: images[0] } };
      },
    });
    renderAt("/admin/content/pages/start");
    const input = await screen.findByLabelText("Bild hochladen");
    fireEvent.change(input, {
      target: { files: [new File(["bytes"], "bild.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Bild 5 · JPEG · 2 KB")).toBeInTheDocument();
    expect(screen.getByText("![Bild](/api/content/images/5)")).toBeInTheDocument();
    const upload = calls.find(
      (call) => call.method === "POST" && call.path === "/api/content/images?item=start",
    );
    expect(upload?.csrf).toBe("csrf-1");
  });

  it("[CNT-06] an image that the text still shows cannot be removed; the message says so", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({
        status: 200,
        body: { ...content, startMarkdown: "![x](/api/content/images/5)" },
      }),
      "GET /api/content/images?item=start": () => ({
        status: 200,
        body: {
          images: [
            { id: 5, mime: "image/jpeg", bytes: 2048, createdAt: "2027-01-01T10:00:00.000Z" },
          ],
        },
      }),
      "DELETE /api/content/images/5": () => ({
        status: 409,
        body: { error: { code: "image_in_use", message: "the text still uses the image" } },
      }),
    });
    renderAt("/admin/content/pages/start");
    expect(await screen.findByText("im Text")).toBeInTheDocument();
    user.click(screen.getByRole("button", { name: "Entfernen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Das Bild wird noch im Text");
  });

  it("[CNT-07] an admin adds a place; a link that is not https to Google Maps is refused", async () => {
    let places: unknown[] = [];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: { ...content, places } }),
      "POST /api/content/places": () => {
        places = [
          {
            id: 3,
            name: "Kirche Muri",
            address: "Kirchstrasse 1",
            mapsUrl: "https://maps.app.goo.gl/Kirche",
            mapImageId: null,
          },
        ];
        return { status: 200, body: { ...content, places } };
      },
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("button", { name: "+ Ort" }));
    user.type(await screen.findByLabelText("Name"), "Kirche Muri");
    user.type(screen.getByLabelText("Adresse (optional)"), "Kirchstrasse 1");
    user.type(
      screen.getByLabelText("Google-Maps-Link (optional)"),
      "http://maps.google.com/?q=Muri",
    );
    user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Link muss https zu Google Maps sein.",
    );
    expect(
      calls.some((call) => call.method === "POST" && call.path === "/api/content/places"),
    ).toBe(false);

    user.type(
      screen.getByLabelText("Google-Maps-Link (optional)"),
      "https://maps.app.goo.gl/Kirche",
    );
    user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(
        calls.some((call) => call.method === "POST" && call.path === "/api/content/places"),
      ).toBe(true);
    });
    expect(
      calls.find((call) => call.method === "POST" && call.path === "/api/content/places")?.body,
    ).toEqual({
      name: "Kirche Muri",
      address: "Kirchstrasse 1",
      mapsUrl: "https://maps.app.goo.gl/Kirche",
      mapImageId: null,
    });
  });

  it("[CNT-07] a place that a page or a program item uses is not deleted; the message says why", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: { ...content, places: [place] } }),
      "GET /api/content/images?item=place:3": () => ({ status: 200, body: { images: [] } }),
      "DELETE /api/content/places/3": () => ({
        status: 409,
        body: { error: { code: "place_in_use", message: "the place is used" } },
      }),
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("link", { name: /Kirche Muri/ }));
    user.click(await screen.findByRole("button", { name: "Ort löschen" }));
    user.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Der Ort wird noch genutzt");
  });

  it("[CNT-07] a page lists the places it chooses; the choice is saved with the page", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: { ...content, places: [place] } }),
      "GET /api/content/images?item=page:1": () => ({ status: 200, body: { images: [] } }),
      "PUT /api/content/pages/1": () => ({ status: 200, body: { ...content, places: [place] } }),
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("link", { name: /Das Fest/ }));
    user.click(await screen.findByRole("button", { name: "Kirche Muri" }));
    expect(screen.getByRole("button", { name: "Kirche Muri" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    await waitFor(() => {
      expect(
        calls.some((call) => call.method === "PUT" && call.path === "/api/content/pages/1"),
      ).toBe(true);
    });
    expect(
      calls.find((call) => call.method === "PUT" && call.path === "/api/content/pages/1")?.body,
    ).toMatchObject({
      placeIds: [3],
    });
  });
});

describe("finding fixes of the list and the editors", () => {
  it("[CNT-05] a published new page returns to the list, not to an empty screen", async () => {
    const created = {
      ...content,
      pages: [
        ...content.pages,
        { id: 7, slug: "neu", title: "Neu", markdown: "", inMore: true, position: 2, placeIds: [] },
      ],
    };
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: created }),
      "POST /api/content/pages": () => ({ status: 200, body: created }),
    });
    renderAt("/admin/content/pages/new");
    user.type(await screen.findByLabelText("Titel"), "Neu");
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    expect(await screen.findByRole("heading", { name: "Inhalte" })).toBeInTheDocument();
    expect(
      screen.queryByText("Wähle links eine Seite oder die Startseite aus."),
    ).not.toBeInTheDocument();
  });

  it("[CNT-05] the chevron is the last thing in a row, after the up and down buttons", async () => {
    fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content");
    const row = (await screen.findByRole("link", { name: /Das Fest/ })).closest("li");
    expect(row?.lastElementChild).toHaveTextContent("›");
    expect(row?.querySelectorAll("button").length).toBe(2);
  });
});
