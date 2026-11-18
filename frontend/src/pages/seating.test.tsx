// The table finder (PRES-06, PRES-07, PRES-12; UX mocks `seating`, `game-table`): the guest's table and tablemates,
// the notice before the plan is visible, the page in the game overlay, and the card on the start page.
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Root from "../app/Root.tsx";
import { initI18n } from "../i18n/i18n.ts";
import GameOverlay from "../game/GameOverlay.tsx";
import { anna, event, fakeBackend, renderAt, signedIn } from "../test/backend.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The published website as `GET /api/content` answers it, without pages. */
const site = {
  startMarkdown: "Willkommen!",
  pages: [],
  places: [],
  start: { heroImageId: null, heroAlt: null, countdown: false },
};

const mate = (changes: Record<string, unknown>) => ({
  key: "u2",
  name: "Lukas Meier",
  companionOf: null,
  greeting: null,
  badge: null,
  line: null,
  photo: null,
  ...changes,
});

const visible = (tables: unknown[]) => ({
  visible: true,
  visibleFrom: "2027-06-01T00:00:00.000Z",
  tables,
});

const table = (changes: Record<string, unknown> = {}) => ({
  name: "Edelweiss",
  map: "saal",
  mapName: "Saal",
  places: 8,
  party: ["Anna"],
  mates: [],
  ...changes,
});

function backend(seating: unknown) {
  return fakeBackend({
    "GET /api/session": () => signedIn,
    "GET /api/event": () => ({ status: 200, body: event }),
    "GET /api/seating": () => ({ status: 200, body: seating }),
  });
}

describe("the table finder page", () => {
  it("[PRES-06] before the date the admin set, a notice with that date replaces the plan", async () => {
    backend({ visible: false, visibleFrom: "2027-06-12T08:30:00.000Z", tables: [] });
    renderAt("/seating");
    const notice = await screen.findByTestId("seating-hidden");
    expect(within(notice).getByText("Noch ein Geheimnis")).toBeVisible();
    expect(notice).toHaveTextContent(/12\.6\.2027/);
  });

  it("[PRES-06] without a date the plan stays hidden, and says so without a date", async () => {
    backend({ visible: false, visibleFrom: null, tables: [] });
    renderAt("/seating");
    const notice = await screen.findByTestId("seating-hidden");
    expect(notice).toHaveTextContent("sobald er feststeht");
  });

  it("[PRES-06][PRES-12] shows the table with its map and places and the tablemates with greeting, badge and line, no seat", async () => {
    backend(
      visible([
        table({
          mates: [
            mate({ greeting: "Bin für jeden Tanz zu haben!", badge: "Freunde Bräutigam" }),
            mate({ key: "u3", name: "Sara Keller", line: "Frag mich nach dem Kuchen.", photo: 5 }),
          ],
        }),
      ]),
    );
    renderAt("/seating");
    expect(await screen.findByText("Dein Tisch")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Edelweiss" })).toBeVisible();
    expect(screen.getByText("Saal · 8 Plätze")).toBeVisible();
    const mates = screen.getAllByTestId("tablemate");
    expect(mates).toHaveLength(2);
    const [lukas] = mates;
    if (lukas === undefined) throw new Error("no tablemate");
    expect(within(lukas).getByText("Lukas Meier")).toBeVisible();
    expect(within(lukas).getByText("Bin für jeden Tanz zu haben!")).toBeVisible();
    expect(within(lukas).getByText("Freunde Bräutigam")).toBeVisible();
    // A tablemate with a photo shows it from the table finder's own address.
    expect(mates[1]?.querySelector("img")).toHaveAttribute("src", "/api/seating/photo/u3?v=5");
    expect(screen.queryByText(/Platz \d|seat/i)).toBeNull();
  });

  it("[PRES-07] a plain number is «Tisch 1», a companion without a badge is named as the guest's companion, and a companion at another table has a table of her own", async () => {
    backend(
      visible([
        table({
          name: "1",
          party: ["Anna"],
          mates: [mate({ key: "c4", name: "Mia", companionOf: "Anna" })],
        }),
        table({ name: "Enzian", party: ["Nora"], mates: [] }),
      ]),
    );
    renderAt("/seating");
    expect(await screen.findByRole("heading", { name: "Tisch 1" })).toBeVisible();
    expect(screen.getByText("Begleitung von Anna")).toBeVisible();
    expect(screen.getByText("Tisch für Nora")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Enzian" })).toBeVisible();
    expect(screen.getByText("Noch niemand sonst an diesem Tisch.")).toBeVisible();
  });

  it("[PRES-06] a guest without a table is told, friendly, that none is entered yet", async () => {
    backend(visible([]));
    renderAt("/seating");
    expect(await screen.findByTestId("seating-none")).toHaveTextContent("Noch kein Platz");
  });

  it("[PRES-06] «Mehr» leads to the page", async () => {
    backend(visible([table()]));
    renderAt("/mehr");
    const link = await screen.findByRole("link", { name: "Wo sitze ich?" });
    expect(link).toHaveAttribute("href", "/seating");
  });

  it("[PRES-06] a clickable object of the game opens the same page in the overlay (action page = seating)", async () => {
    backend(visible([table({ mates: [mate({})] })]));
    render(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              element: <Root />,
              children: [
                {
                  path: "/",
                  element: (
                    <GameOverlay
                      overlay={{
                        action: { kind: "page", page: "seating" },
                        label: "Wo sitze ich?",
                      }}
                      onClose={vi.fn()}
                      onLeave={vi.fn()}
                    />
                  ),
                },
              ],
            },
          ],
          { initialEntries: ["/"] },
        )}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Edelweiss" })).toBeVisible();
    expect(screen.getByText("Lukas Meier")).toBeVisible();
  });
});

describe("the card on the start page", () => {
  it("[PRES-06] on the event day the start page shows the table and some tablemates", async () => {
    fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: anna, csrfToken: "c" } }),
      "GET /api/event": () => ({ status: 200, body: event }),
      "GET /api/world": () => ({ status: 200, body: null }),
      "GET /api/content": () => ({ status: 200, body: site }),
      "GET /api/website": () => ({
        status: 200,
        body: { eventDay: true, eventDate: "2027-06-12", now: null, next: null, countdown: null },
      }),
      "GET /api/seating": () => ({
        status: 200,
        body: visible([
          table({
            mates: [
              mate({ name: "Lukas Meier" }),
              mate({ key: "u3", name: "Sara Keller" }),
              mate({ key: "u4", name: "Tom Brunner" }),
            ],
          }),
        ]),
      }),
    });
    renderAt("/");
    const card = await screen.findByTestId("seat-card");
    expect(card).toHaveAttribute("href", "/seating");
    expect(card).toHaveTextContent("Edelweiss");
    expect(card).toHaveTextContent("mit Lukas, Sara und 1 weiteren");
  });
});
