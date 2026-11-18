// Entering the game (GAME-12 – GAME-14, GAME-17, GAME-18; UX mocks game, onboard-avatar, home). The Phaser canvas and the
// avatar editor are replaced by stand-ins: they are tested elsewhere (end-to-end, avatar.test.tsx).
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { fakeBackend, renderAt, signedIn, user } from "../test/backend.tsx";

vi.mock("./GameCanvas.tsx", () => ({
  default: ({
    onActivate,
    onPlayerTap,
  }: {
    onActivate: (a: { mapId: string; object: string; action: unknown }) => void;
    onPlayerTap: () => void;
  }) => (
    <div data-testid="game-canvas">
      <button
        type="button"
        onClick={() => {
          onActivate({
            mapId: "kirche",
            object: "altar",
            action: { kind: "page", page: "programme" },
          });
        }}
      >
        use object
      </button>
      <button type="button" onClick={onPlayerTap}>
        own avatar
      </button>
    </div>
  ),
}));
vi.mock("../avatar/AvatarEditor.tsx", () => ({
  default: ({
    continueLabel,
    continueWaiting,
    onContinue,
  }: {
    continueLabel: string;
    continueWaiting?: boolean;
    onContinue: () => void;
  }) => (
    <button type="button" disabled={continueWaiting === true} onClick={onContinue}>
      {continueLabel}
    </button>
  ),
}));

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const world = {
  version: "w1",
  name: "Testwelt",
  startMap: "kirche",
  tileWidth: 64,
  tileHeight: 32,
  maps: ["kirche"],
  figures: [],
  actions: [],
};
const person = (chosen: boolean) => ({
  id: "me",
  name: "Anna",
  figure: "a",
  chosen,
  figures: [{ id: "a", type: "female" }],
});
const programme = { hidden: false, eventDay: false, eventDate: null, items: [] };
const rsvpState = (answered: boolean) => ({
  name: "Anna",
  deadline: null,
  closed: false,
  songEnabled: false,
  perItem: false,
  personType: "adult",
  companionApproval: false,
  programItems: [
    {
      id: 1,
      name: "Trauung",
      hasMeal: false,
      activities: [
        {
          id: 1,
          name: "Trauung",
          startsAt: "2027-06-12T12:00:00.000Z",
          endsAt: null,
          placeId: null,
          place: null,
        },
      ],
    },
  ],
  menus: [],
  answer: answered
    ? {
        attendingItemIds: [1],
        declinedItemIds: [],
        menuId: null,
        song: null,
        persons: [],
      }
    : null,
  companions: [],
});

function setup(options: { chosen?: boolean; answered?: boolean; world?: boolean } = {}) {
  return fakeBackend({
    "GET /api/session": () => signedIn,
    "GET /api/world": () => ({ status: 200, body: options.world === false ? null : world }),
    "GET /api/avatar": () => ({ status: 200, body: { persons: [person(options.chosen ?? true)] } }),
    "GET /api/rsvp": () => ({ status: 200, body: rsvpState(options.answered ?? true) }),
    "GET /api/programme": () => ({ status: 200, body: programme }),
  });
}

describe("entering the game", () => {
  it("[GAME-12] with an active world, the start leads into the game; the Website button shows the start page, which offers to enter the world", async () => {
    setup();
    renderAt("/");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    user.click(screen.getByRole("link", { name: "Website" }));
    expect(await screen.findByText("Willkommen!")).toBeVisible();
    expect(screen.getByRole("link", { name: "Erlebniswelt betreten" })).toHaveAttribute(
      "href",
      "/game",
    );
  });

  it("[GAME-12] a direct link opens its target, and without a world the start page stays", async () => {
    setup();
    renderAt("/programme");
    expect(await screen.findByRole("heading", { name: "Programm" })).toBeVisible();
    expect(screen.queryByTestId("game-canvas")).toBeNull();
  });

  it("[MAP-19] with guest access off, the world answers 403: the start page shows no entry, and /game and /avatar lead to the start page", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/world": () => ({
        status: 403,
        body: { error: { code: "world_access_disabled", message: "off" } },
      }),
    });
    renderAt("/");
    expect(await screen.findByText("Willkommen!")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Erlebniswelt betreten" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Erlebniswelt" })).toBeNull();
    cleanup();
    for (const path of ["/game", "/avatar"]) {
      renderAt(path);
      expect(await screen.findByText("Willkommen!"), path).toBeVisible();
      cleanup();
    }
  });

  it("[GAME-12] without an active world, the start page shows no entry", async () => {
    setup({ world: false });
    renderAt("/");
    expect(await screen.findByText("Willkommen!")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Erlebniswelt betreten" })).toBeNull();
  });

  it("[GAME-13] the first entry starts with the avatar, and the RSVP opens in an overlay when it is still open", async () => {
    setup({ chosen: false, answered: false });
    renderAt("/game");
    expect(await screen.findByRole("heading", { name: "Wie siehst du aus?" })).toBeVisible();
    expect(screen.queryByTestId("game-canvas")).toBeNull();
    // The RSVP state is known before the guest is through the avatar step.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
    });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    expect(await screen.findByRole("dialog", { name: "Rückmeldung" })).toBeVisible();
  });

  it("[GAME-13] with a figure for everybody and an answered RSVP, the game opens at once", async () => {
    setup({ chosen: true, answered: true });
    renderAt("/game");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[GAME-14] the bar has only the title and the Website button, whether the RSVP is open or answered", async () => {
    for (const answered of [false, true]) {
      setup({ chosen: true, answered });
      renderAt("/game");
      const bar = await screen.findByRole("banner");
      expect(bar).toBeVisible();
      expect(within(bar).getByRole("link", { name: "Website" })).toBeVisible();
      // No Programm or Rückmeldung button, no badge, no navigation: they are reached through the objects.
      expect(within(bar).queryAllByRole("button")).toHaveLength(0);
      expect(within(bar).queryByRole("navigation")).toBeNull();
      expect(within(bar).queryByRole("status")).toBeNull();
      cleanup();
    }
  });

  it("[GAME-07] the hint names the way of playing that suits the device: tapping on a phone, clicking and Enter with a mouse", async () => {
    const matches = (pointerFine: boolean) => () => ({ matches: pointerFine });
    for (const [fine, text] of [
      [false, "Tippe auf Dinge, die funkeln"],
      [true, "Klicke auf Dinge, die funkeln – oder geh hin und drück Enter"],
    ] as const) {
      vi.stubGlobal("matchMedia", matches(fine));
      localStorage.clear();
      setup();
      renderAt("/game");
      expect(await screen.findByTestId("game-hint")).toHaveTextContent(text);
      cleanup();
    }
  });

  it("[GAME-17] the hint shows until the first object is used, and does not come back", async () => {
    setup();
    renderAt("/game");
    expect(await screen.findByTestId("game-hint")).toBeVisible();
    user.click(screen.getByRole("button", { name: "use object" }));
    await waitFor(() => {
      expect(screen.queryByTestId("game-hint")).toBeNull();
    });
    expect(localStorage.getItem("zappaloo.game.hintSeen")).toBe("1");
  });

  it("[GAME-18] a tap on the own avatar opens the profile as an overlay", async () => {
    setup();
    renderAt("/game");
    user.click(await screen.findByRole("button", { name: "own avatar" }));
    expect(await screen.findByRole("dialog", { name: "Profil" })).toBeVisible();
  });
});
