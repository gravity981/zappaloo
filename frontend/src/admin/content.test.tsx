import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, user } from "../test/backend.tsx";

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

/** The content as `GET /api/content` answers it: the start text and the pages in order. */
const content = {
  startMarkdown: "Willkommen!",
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

describe("the content editor", () => {
  it("[CNT-05] an admin changes the start page text and sees the preview", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "PUT /api/content/start": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content");
    const field = await screen.findByLabelText("Begrüssungstext der Startseite");
    expect(field).toHaveValue("Willkommen!");
    user.type(field, "# Hallo\n\nSchön, dass du da bist.");
    user.click(screen.getByRole("button", { name: "Veröffentlichen" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Veröffentlicht.");
    const put = calls.find((call) => call.method === "PUT" && call.path === "/api/content/start");
    expect(put?.body).toEqual({ markdown: "# Hallo\n\nSchön, dass du da bist." });
    expect(put?.csrf).toBe("csrf-1");
    expect(screen.getByRole("heading", { name: "Hallo" })).toBeInTheDocument();
  });

  it("[CNT-05] an admin creates a page; its address follows the title until it is typed over", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "POST /api/content/pages": () => ({ status: 200, body: content }),
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("button", { name: "+ Seite" }));
    user.type(screen.getByLabelText("Titel"), "Anreise & Parkieren");
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

  it("[CNT-05] pages move up and down; the server takes the whole new order", async () => {
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
    expect(
      await screen.findByRole("heading", { name: "Willkommen bei Zappaloo" }),
    ).toBeInTheDocument();
  });
});

const place = {
  id: 3,
  name: "Kirche Muri",
  address: "Kirchstrasse 1",
  mapsUrl: null,
  mapImageId: null,
};

describe("places and images of the content editor", () => {
  it("[CNT-06] an admin uploads an image and gets the Markdown that shows it", async () => {
    let images: unknown[] = [];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: content }),
      "GET /api/content/images": () => ({ status: 200, body: { images } }),
      "POST /api/content/images": () => {
        images = [
          { id: 5, mime: "image/jpeg", bytes: 2048, createdAt: "2027-01-01T10:00:00.000Z" },
        ];
        return { status: 200, body: { image: images[0] } };
      },
    });
    renderAt("/admin/content");
    const input = await screen.findByLabelText("Bild hochladen");
    fireEvent.change(input, {
      target: { files: [new File(["bytes"], "bild.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Bild 5 · JPEG · 2 KB")).toBeInTheDocument();
    expect(screen.getByText("![Bild](/api/content/images/5)")).toBeInTheDocument();
    const upload = calls.find(
      (call) => call.method === "POST" && call.path === "/api/content/images",
    );
    expect(upload?.csrf).toBe("csrf-1");
  });

  it("[CNT-07] an editor adds a place; a link that is not https to Google Maps is refused", async () => {
    let places: unknown[] = [];
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: { ...content, places } }),
      "GET /api/content/images": () => ({ status: 200, body: { images: [] } }),
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
    user.type(screen.getByLabelText("Name"), "Kirche Muri");
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
      "GET /api/content/images": () => ({ status: 200, body: { images: [] } }),
      "DELETE /api/content/places/3": () => ({
        status: 409,
        body: { error: { code: "place_in_use", message: "the place is used" } },
      }),
    });
    renderAt("/admin/content");
    const [edit] = await screen.findAllByRole("button", { name: "Bearbeiten" });
    if (!edit) throw new Error("no place to edit");
    user.click(edit);
    user.click(screen.getByRole("button", { name: "Ort löschen" }));
    user.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Der Ort wird noch genutzt");
  });

  it("[CNT-07] a page lists the places it chooses; the choice is saved with the page", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => asAdmin,
      "GET /api/content": () => ({ status: 200, body: { ...content, places: [place] } }),
      "GET /api/content/images": () => ({ status: 200, body: { images: [] } }),
      "PUT /api/content/pages/1": () => ({ status: 200, body: { ...content, places: [place] } }),
    });
    renderAt("/admin/content");
    user.click(await screen.findByRole("button", { name: "Das Fest" }));
    user.click(screen.getByRole("button", { name: "Kirche Muri" }));
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
