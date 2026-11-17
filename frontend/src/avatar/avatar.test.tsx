// The avatar editor (AVA-01, AVA-02; UX mock onboard-avatar): the kind first, then a figure of that kind; "Zufällig"
// within the kind; a tab per person; "Fertig" waits until every person has a figure.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarFigure } from "@zappaloo/shared";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, renderAt, user } from "../test/backend.tsx";
import { drawFigure } from "./draw.ts";
import { resetFigureArt } from "./figure-art.ts";

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  resetFigureArt();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const signedIn = { status: 200, body: { user: anna, csrfToken: "csrf-1" } };

const figures: AvatarFigure[] = [
  { id: "wedding-guest", label: "Gast", type: "female" },
  { id: "male-guest", type: "male" },
  { id: "tante", label: "Tante", type: "female" },
  { id: "kid", label: "Kind", type: "child" },
];

/** The world the pictures come from: a figure's metadata names its standing pose and its walk. */
const world = {
  version: "w1",
  name: "Testwelt",
  startMap: "kirche",
  tileWidth: 64,
  tileHeight: 32,
  maps: ["kirche"],
  figures: figures.map((figure) => ({
    id: figure.id,
    type: figure.type,
    tier: "tier1",
    metadata: `${figure.id}/metadata.json`,
  })),
  actions: [],
};
const directions = ["south", "west", "east", "north"];
const metadata = {
  states: [
    {
      character: { size: { width: 16, height: 16 } },
      frames: {
        rotations: Object.fromEntries(directions.map((d) => [d, `Idle/rotations/${d}.png`])),
        animations: {
          walking: Object.fromEntries(
            directions.map((d) => [d, [`walk/${d}/0.png`, `walk/${d}/1.png`]]),
          ),
        },
      },
    },
  ],
};

interface Person {
  id: string;
  name: string;
  figure: string | null;
  chosen: boolean;
  figures: AvatarFigure[];
}

const guest: Person = {
  id: "me",
  name: "Anna",
  figure: "wedding-guest",
  chosen: false,
  figures,
};

describe("the avatar editor (AVA-01, AVA-02)", () => {
  it("[AVA-01] offers only the kinds that have a figure the person may choose, and no figures before a kind is chosen", async () => {
    setup([guest]);
    renderAt("/avatar");
    const kinds = await screen.findByRole("group", { name: "Art der Figur" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Mann", "Frau", "Kind"]);
    // «Andere» has no figure in this world; nothing is chosen yet.
    expect(screen.queryByRole("group", { name: "Figur" })).toBeNull();
    expect(screen.getByText("Wähle zuerst die Art der Figur.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Fertig" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zufällig" })).toBeDisabled();
  });

  it("[AVA-01][AVA-02] choosing a kind stores a figure of that kind at once, shows only the figures of the kind, and enables the next step", async () => {
    setup([guest]);
    renderAt("/avatar");
    user.click(await screen.findByRole("button", { name: "Kind" }));
    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Figur" })).toBeVisible();
    });
    const put = lastPut();
    expect(put.body).toEqual({ figure: "kid" });
    expect(put.csrf).toBe("csrf-1");
    expect(screen.getByRole("button", { name: "Fertig" })).toBeEnabled();
    const grid = screen.getByRole("group", { name: "Figur" });
    expect(within(grid).getAllByRole("button")).toHaveLength(1);
  });

  it("[AVA-01] «Zufällig» draws again only within the kind, and is off when the kind has one figure", () => {
    expect(drawFigure(figures, "female", "wedding-guest", () => 0)).toBe("tante");
    expect(drawFigure(figures, "female", "tante", () => 0)).toBe("wedding-guest");
    expect(drawFigure(figures, "female", null, () => 0.99)).toBe("tante");
    // A kind with one figure draws that figure; a kind without figures draws none.
    expect(drawFigure(figures, "child", "kid", () => 0)).toBe("kid");
    expect(drawFigure(figures, "other", null, () => 0)).toBeUndefined();
  });

  it("[AVA-01][PRES-07] a tab per approved companion; the next step waits until every person has a figure", async () => {
    const mia: Person = {
      id: "7",
      name: "Mia",
      figure: "wedding-guest",
      chosen: false,
      figures,
    };
    setup([{ ...guest, chosen: true, figure: "male-guest" }, mia]);
    renderAt("/avatar");
    const tabs = await screen.findByRole("group", { name: "Personen" });
    expect(
      within(tabs)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Anna ✓", "Mia"]);
    // Anna has a figure, Mia has not: the next step waits.
    expect(screen.getByRole("button", { name: "Fertig" })).toBeDisabled();
    expect(screen.getByText(/Wähle für jede Person eine Figur/)).toBeVisible();
    user.click(within(tabs).getByRole("button", { name: "Mia" }));
    user.click(await screen.findByRole("button", { name: "Frau" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Fertig" })).toBeEnabled();
    });
    expect(lastPut().path).toBe("/api/avatar/7");
  });

  it("[AVA-02] a person who already chose shows the chosen figure's kind and grid at once", async () => {
    setup([{ ...guest, chosen: true, figure: "tante" }]);
    renderAt("/avatar");
    const grid = await screen.findByRole("group", { name: "Figur" });
    expect(
      within(grid)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Gast", "Tante"]);
    expect(within(grid).getByRole("button", { name: "Tante" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Zufällig" })).toBeEnabled();
  });
});

// --- A backend that follows the PUT calls of the editor ---

interface Put {
  path: string;
  body: unknown;
  csrf: string | null;
}
let puts: Put[] = [];
const lastPut = (): Put => {
  const last = puts.at(-1);
  if (!last) throw new Error("no PUT was sent");
  return last;
};

/** The persons as the avatar API answers them; a PUT applies the choice and answers with the new state. */
function setup(persons: Person[]) {
  puts = [];
  const state = persons.map((person) => ({ ...person }));
  const handlers: Record<string, () => { status: number; body?: unknown }> = {
    "GET /api/session": () => signedIn,
    "GET /api/avatar": () => ({ status: 200, body: { persons: state } }),
    "GET /api/world": () => ({ status: 200, body: world }),
  };
  for (const figure of figures) {
    handlers[`GET /api/world/w1/avatar/${figure.id}/metadata.json`] = () => ({
      status: 200,
      body: metadata,
    });
  }
  const calls = fakeBackend(handlers);
  // The fake backend matches exact paths: each person's PUT is registered.
  for (const person of state) {
    handlers[`PUT /api/avatar/${person.id}`] = () => {
      const call = calls.filter((item) => item.method === "PUT").at(-1);
      puts.push({ path: call?.path ?? "", body: call?.body, csrf: call?.csrf ?? null });
      person.figure = (call?.body as { figure: string } | undefined)?.figure ?? null;
      person.chosen = true;
      return { status: 200, body: { persons: state } };
    };
  }
}
