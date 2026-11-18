// The page game world › Welt & Import (MAP-05, MAP-06, MAP-08, MAP-09; UX mock admin-world, variant "import").
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, hold, renderAt, user } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const admin = { ...anna, id: 9, username: "lea", displayName: "Lea", roles: ["admin"] };
const asAdmin = () => ({ status: 200, body: { user: admin, csrfToken: "csrf-9" } });

const sommerfest = {
  importId: "imp-2",
  name: "Sommerfest",
  formatVersion: 2,
  importedAt: "2026-11-14T18:04:00.000Z",
  startMap: "kirche",
  tileWidth: 64,
  tileHeight: 32,
  figures: 2,
  maps: [
    { id: "garten", name: "Garten", clickable: 2, portals: 2 },
    { id: "kirche", name: "Kirche & Garten", clickable: 4, portals: 1 },
  ],
  hasDoor: true,
  warnings: [
    {
      file: "maps/kirche.json",
      object: "infotafel",
      code: "preset_missing",
      severity: "warning",
      detail: "the page p/geschichte does not exist",
    },
  ],
};
const previous = { name: "Erste Welt", importedAt: "2026-11-10T20:40:00.000Z" };

/** The file input of the card. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input on the page");
  return input;
}

describe("game world › Welt & Import", () => {
  it("[MAP-05] shows the active world with its format, start map and maps with their counts", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active: sommerfest, previous: null },
      }),
    });
    renderAt("/admin/world");
    expect(await screen.findByText("Aktiv: Sommerfest")).toBeVisible();
    expect(
      screen.getByText(
        /Format 2 · Kachel 64 × 32 Pixel · 2 Figuren · importiert am .* · Startkarte: kirche/,
      ),
    ).toBeVisible();
    const kirche = screen.getByText("Kirche & Garten").closest("tr");
    expect(kirche).not.toBeNull();
    expect(within(kirche as HTMLElement).getByText("4")).toBeVisible();
    expect(within(kirche as HTMLElement).getByText("kirche")).toBeVisible();
    expect(within(kirche as HTMLElement).getByText("★")).toBeVisible();
    expect(screen.getByText("Karten (2)")).toBeVisible();
    // Without a previous world there is no way back.
    expect(screen.queryByRole("button", { name: "Zurückrollen" })).toBeNull();
  });

  it("[MAP-05] without a world the page says so and guests land on the website", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: false, active: null, previous: null },
      }),
    });
    renderAt("/admin/world");
    expect(await screen.findByText("Keine Welt")).toBeVisible();
    expect(screen.getByText(/Es ist noch keine digitale Erlebniswelt importiert/)).toBeVisible();
    expect(screen.getByText("Welt importieren")).toBeVisible();
  });

  it("[MAP-08] the warnings of an accepted world stay listed with it", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active: sommerfest, previous: null },
      }),
    });
    renderAt("/admin/world");
    const warnings = await screen.findByText("Warnungen (1)");
    expect(warnings).toBeVisible();
    // The warnings come last, below the table of maps.
    const maps = screen.getByRole("table");
    expect(maps.compareDocumentPosition(warnings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText(
        "warning: maps/kirche.json › infotafel: the page p/geschichte does not exist",
      ),
    ).toBeVisible();
  });

  it("[MAP-06] a refused package lists every finding; the active world stays as it was", async () => {
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active: sommerfest, previous: null },
      }),
      "POST /api/admin/world": () => ({
        status: 422,
        body: {
          error: { code: "world_refused", message: "the package was refused" },
          findings: [
            {
              file: "maps/linde.json",
              object: "zum-garten",
              code: "map_reference",
              severity: "error",
              detail: "spawn tor not found in map kirche",
            },
            {
              file: "avatar/wedding-guest/Idle/rotations/south.png",
              code: "figure_frame",
              severity: "error",
              detail: "the frame is 32 × 32; the canvas is 48 × 48",
            },
          ],
        },
      }),
    });
    renderAt("/admin/world");
    await screen.findByText("Aktiv: Sommerfest");
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "welt.tar.gz", { type: "application/gzip" })] },
    });
    expect(await screen.findByText("Das Paket wurde abgelehnt")).toBeVisible();
    expect(
      screen.getByText("error: maps/linde.json › zum-garten: spawn tor not found in map kirche"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "error: avatar/wedding-guest/Idle/rotations/south.png: the frame is 32 × 32; the canvas is 48 × 48",
      ),
    ).toBeVisible();
    expect(screen.getByText("Aktiv: Sommerfest")).toBeVisible();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("[MAP-05] an accepted package is sent with the world's media type and shown at once", async () => {
    let active: typeof sommerfest | null = null;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active, previous: null },
      }),
      "POST /api/admin/world": () => {
        active = sommerfest;
        return { status: 200, body: { guestAccess: true, active, previous: null } };
      },
    });
    renderAt("/admin/world");
    await screen.findByText("Keine Welt");
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "welt.tar.gz", { type: "application/gzip" })] },
    });
    expect(await screen.findByText("Aktiv: Sommerfest")).toBeVisible();
    const post = calls.find((call) => call.method === "POST");
    expect(post?.contentType).toBe("application/vnd.zappaloo.world");
  });

  it("[MAP-09] the return to the previous world takes a second click", async () => {
    let active: typeof sommerfest = sommerfest;
    let before: typeof previous | null = previous;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active, previous: before },
      }),
      "POST /api/admin/world/rollback": () => {
        active = { ...sommerfest, name: "Erste Welt", importId: "imp-1" };
        before = { name: "Sommerfest", importedAt: sommerfest.importedAt };
        return { status: 200, body: { guestAccess: true, active, previous: before } };
      },
    });
    renderAt("/admin/world");
    await screen.findByText("Aktiv: Sommerfest");
    expect(screen.getByText(/Vorherige Welt: «Erste Welt»/)).toBeVisible();
    user.click(screen.getByRole("button", { name: "Zurückrollen" }));
    // The first click only asks.
    expect(await screen.findByRole("button", { name: "Ja, zurückrollen" })).toBeVisible();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("button", { name: "Ja, zurückrollen" })).toBeNull();
    user.click(screen.getByRole("button", { name: "Zurückrollen" }));
    hold(await screen.findByRole("button", { name: "Ja, zurückrollen" }));
    expect(await screen.findByText("Aktiv: Erste Welt")).toBeVisible();
    await waitFor(() => {
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    });
  });
});

describe("game world › guest access (MAP-19)", () => {
  it("[MAP-19] the switch shows whether guests may enter, and flipping it is sent at once", async () => {
    let guestAccess = true;
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess, active: sommerfest, previous: null },
      }),
      "PUT /api/admin/world/guest-access": () => {
        guestAccess = false;
        return { status: 200, body: { guestAccess, active: sommerfest, previous: null } };
      },
    });
    renderAt("/admin/world");
    const toggle = await screen.findByRole("switch", { name: "Gästezugang zur Erlebniswelt" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Gäste können die Erlebniswelt betreten.")).toBeVisible();
    user.click(toggle);
    expect(
      await screen.findByText(
        "Gäste können die Erlebniswelt nicht öffnen; die aktive Welt bleibt erhalten.",
      ),
    ).toBeVisible();
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({ enabled: false });
    expect(put?.csrf).toBe("csrf-9");
    expect(screen.getByRole("switch", { name: "Gästezugang zur Erlebniswelt" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("[MAP-19] without a world there is no switch", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: false, active: null, previous: null },
      }),
    });
    renderAt("/admin/world");
    await screen.findByText("Keine Welt");
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

/** The website's content, whose page titles name the pages in the select. */
const site = {
  startMarkdown: "",
  pages: [
    {
      id: 1,
      slug: "anreise",
      title: "Anreise & Parkieren",
      markdown: "",
      inMore: true,
      position: 0,
      placeIds: [],
    },
  ],
  places: [],
  start: { heroImageId: null, heroAlt: null, countdown: true },
};

describe("game world › Objekte & Portale (MAP-15)", () => {
  const objects = {
    maps: [
      {
        id: "kirche",
        name: "Kirche & Garten",
        clickables: [
          {
            name: "altar",
            label: "Programm",
            hidden: false,
            preset: { kind: "page", page: "programme" },
            missing: false,
          },
          {
            name: "pastor",
            hidden: false,
            preset: { kind: "dialog", dialogId: "npc-pastor" },
            missing: true,
          },
          { name: "osterei", hidden: true, missing: false },
        ],
        portals: [{ name: "zum-garten", targetMap: "garten", targetSpawn: "start" }],
      },
      { id: "garten", name: "Garten", clickables: [], portals: [] },
    ],
    startMap: "kirche",
    pages: ["programme", "rsvp", "profile", "p/anreise"],
    dialogues: [],
  };

  it("[MAP-15] lists each map's clickable objects with their preset, marks what is missing, and shows portals read-only", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active: sommerfest, previous: null },
      }),
      "GET /api/admin/world/objects": () => ({ status: 200, body: objects }),
      "GET /api/content": () => ({ status: 200, body: site }),
    });
    renderAt("/admin/world");
    user.click(await screen.findByRole("button", { name: "Objekte & Portale" }));
    expect(await screen.findByText("Anklickbare Objekte (3)")).toBeVisible();
    // The select shows the action that applies; the preset has its own column.
    const altar = screen.getByRole("combobox", { name: "Aktion von Programm" });
    expect(altar).toHaveValue("page:programme");
    expect(within(altar).getByRole("option", { name: "Seite: Programm" })).toBeVisible();
    expect(within(altar).getByRole("option", { name: "Seite: Anreise & Parkieren" })).toBeVisible();
    expect(within(altar).getByRole("option", { name: "– keine –" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Vorgabe aus Tiled" })).toBeVisible();
    // A preset that points to nothing is marked; an easter egg is named as such.
    const row = screen.getByRole("combobox", { name: "Aktion von pastor" }).closest("tr");
    expect(row && within(row).getByText("fehlt")).toBeVisible();
    expect(screen.getByText("Easter Egg")).toBeVisible();
    expect(screen.getByText("Portale (1)")).toBeVisible();
    expect(screen.getByText("zum-garten")).toBeVisible();
    expect(screen.getByText("→ Garten · Spawn «start»")).toBeVisible();
    // Portals are read-only: nothing to change in their list.
    expect(
      within(screen.getByRole("region", { name: "Portale (1)" })).queryByRole("combobox"),
    ).toBeNull();
  });

  it("[MAP-15] picking an action saves it at once; the preset can be restored", async () => {
    const calls = fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: true, active: sommerfest, previous: null },
      }),
      "GET /api/admin/world/objects": () => ({ status: 200, body: objects }),
      "GET /api/content": () => ({ status: 200, body: site }),
      "PUT /api/admin/world/objects/kirche/altar": () => ({ status: 200, body: objects }),
    });
    renderAt("/admin/world");
    user.click(await screen.findByRole("button", { name: "Objekte & Portale" }));
    const altar = await screen.findByRole("combobox", { name: "Aktion von Programm" });
    fireEvent.change(altar, { target: { value: "page:p/anreise" } });
    expect(await screen.findByText("Gespeichert.")).toBeVisible();
    fireEvent.change(altar, { target: { value: "none" } });
    // Picking what the preset says (the programme) returns to the preset.
    fireEvent.change(altar, { target: { value: "page:programme" } });
    await waitFor(() => {
      expect(calls.filter((call) => call.method === "PUT").map((call) => call.body)).toEqual([
        { action: { kind: "page", page: "p/anreise" } },
        { action: { kind: "none" } },
        { action: null },
      ]);
    });
    expect(calls.find((call) => call.method === "PUT")?.csrf).toBe("csrf-9");
  });

  it("[MAP-15] without a world, the tab says so", async () => {
    fakeBackend({
      "GET /api/session": asAdmin,
      "GET /api/admin/world": () => ({
        status: 200,
        body: { guestAccess: false, active: null, previous: null },
      }),
      "GET /api/admin/world/objects": () => ({
        status: 200,
        body: { startMap: "", maps: [], pages: ["programme"], dialogues: [] },
      }),
    });
    renderAt("/admin/world");
    user.click(await screen.findByRole("button", { name: "Objekte & Portale" }));
    expect(await screen.findByText(/noch keine Welt importiert/)).toBeVisible();
  });
});
