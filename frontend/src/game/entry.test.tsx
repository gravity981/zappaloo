// Entering the game (GAME-12 – GAME-14, GAME-17; UX mocks game, onboard-avatar, home). The Phaser canvas and the
// avatar editor are replaced by stand-ins: they are tested elsewhere (end-to-end, avatar.test.tsx).
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { fakeBackend, renderAt, signedIn, user } from "../test/backend.tsx";

vi.mock("./GameCanvas.tsx", () => ({
  default: ({
    onActivate,
  }: {
    onActivate: (a: { mapId: string; object: string; action: unknown }) => void;
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
const programme = { eventDay: false, eventDate: null, items: [] };
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
      shortCode: null,
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

/** The profile of the signed-in guest and the relation list (PRES-09, PRES-15). */
const profiles = {
  persons: [
    {
      id: "me",
      key: "u1",
      name: "Anna",
      greeting: null,
      relation: null,
      relationLine: null,
      photo: null,
    },
  ],
  relations: [
    { id: 1, name: "Familie Braut" },
    { id: 2, name: "Freunde Braut" },
  ],
};

function setup(
  options: { chosen?: boolean; answered?: boolean; world?: boolean; eventDate?: string } = {},
) {
  return fakeBackend({
    ...(options.eventDate === undefined
      ? {}
      : {
          "GET /api/website": () => ({
            status: 200,
            body: {
              countdown: null,
              eventDay: false,
              eventDate: options.eventDate,
              now: null,
              next: null,
            },
          }),
        }),
    "GET /api/session": () => signedIn,
    "GET /api/world": () => ({ status: 200, body: options.world === false ? null : world }),
    "GET /api/avatar": () => ({ status: 200, body: { persons: [person(options.chosen ?? true)] } }),
    "GET /api/profile/people": () => ({ status: 200, body: profiles }),
    "GET /api/rsvp": () => ({ status: 200, body: rsvpState(options.answered ?? true) }),
    "GET /api/programme": () => ({ status: 200, body: programme }),
  });
}

describe("entering the game", () => {
  it("[GAME-12] with an active world, the start leads into the game; the Webseite button shows the start page, which offers to enter the world", async () => {
    setup();
    renderAt("/");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    user.click(screen.getByRole("link", { name: "Webseite" }));
    expect(await screen.findByText("Willkommen!")).toBeVisible();
    expect(screen.getByRole("link", { name: "Erlebniswelt betreten" })).toHaveAttribute(
      "href",
      "/game",
    );
  });

  it("[GAME-14] the bar over the game shows the event's name with its date, as the website's header does, and Webseite", async () => {
    setup({ eventDate: "2027-06-12" });
    renderAt("/game");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    const bar = screen.getByRole("banner");
    expect(bar).toHaveClass("game-bar");
    expect(await within(bar).findByText(/12\. Juni 2027/)).toBeVisible();
    expect(within(bar).getByRole("link", { name: "Webseite" })).toHaveAttribute("href", "/");
  });

  it("[GAME-14] without a date of the event the bar shows the name alone", async () => {
    setup();
    renderAt("/game");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Webseite" })).toBeVisible();
    expect(bar.querySelector("small")).toBeNull();
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
    // Then the guest says hello (profile photo, greeting, relation); skipping goes on.
    expect(await screen.findByRole("heading", { name: "Sag hallo" })).toBeVisible();
    expect(screen.queryByTestId("game-canvas")).toBeNull();
    user.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    expect(await screen.findByRole("dialog", { name: "Anmeldung" })).toBeVisible();
  });

  it("[GAME-13][PRES-09][PRES-13][PRES-15] the step «Sag hallo» stores the greeting and the chosen relation and shows the bubble preview", async () => {
    const saved: unknown[] = [];
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/world": () => ({ status: 200, body: world }),
      "GET /api/avatar": () => ({ status: 200, body: { persons: [person(false)] } }),
      "GET /api/profile/people": () => ({ status: 200, body: profiles }),
      "PUT /api/profile/people/me": () => {
        saved.push("saved");
        return {
          status: 200,
          body: {
            ...profiles,
            persons: [
              {
                ...profiles.persons[0],
                greeting: "Hallo zusammen",
                relation: 2,
                relationLine: "WG aus Bern",
              },
            ],
          },
        };
      },
      "GET /api/rsvp": () => ({ status: 200, body: rsvpState(true) }),
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    renderAt("/game");
    await screen.findByRole("heading", { name: "Wie siehst du aus?" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
    });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Sag hallo" });
    user.type(screen.getByLabelText("Gruss (eine Zeile)"), "Hallo zusammen");
    // The preview follows the typing, before anything is stored.
    expect(within(screen.getByTestId("bubble-preview")).getByText("Hallo zusammen")).toBeVisible();
    user.click(screen.getByRole("button", { name: "Freunde Braut" }));
    await waitFor(() => {
      expect(saved.length).toBeGreaterThan(0);
    });
    expect(
      await screen.findByRole("button", { name: "Freunde Braut", pressed: true }),
    ).toBeVisible();
    expect(within(screen.getByTestId("bubble-preview")).getByText("Freunde Braut")).toBeVisible();
    user.click(screen.getByRole("button", { name: "Los geht's" }));
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
  });

  it("[GAME-13] with a figure for everybody and an answered RSVP, the game opens at once", async () => {
    setup({ chosen: true, answered: true });
    renderAt("/game");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[GAME-14] the bar has only the title and the Webseite button, whether the RSVP is open or answered", async () => {
    for (const answered of [false, true]) {
      setup({ chosen: true, answered });
      renderAt("/game");
      const bar = await screen.findByRole("banner");
      expect(bar).toBeVisible();
      expect(within(bar).getByRole("link", { name: "Webseite" })).toBeVisible();
      // No Programm or Anmeldung button, no badge, no navigation: they are reached through the objects.
      expect(within(bar).queryAllByRole("button")).toHaveLength(0);
      expect(within(bar).queryByRole("navigation")).toBeNull();
      expect(within(bar).queryByRole("status")).toBeNull();
      cleanup();
    }
  });

  /** The backend of a first entry with the welcome dialogue picked (or not): the guest has no figure yet. */
  function welcomeSetup(options: { welcome: string | null; answered?: boolean }) {
    return fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/world": () => ({
        status: 200,
        body: { ...world, welcomeDialogue: options.welcome },
      }),
      "GET /api/avatar": () => ({ status: 200, body: { persons: [person(false)] } }),
      "GET /api/profile/people": () => ({ status: 200, body: profiles }),
      "GET /api/rsvp": () => ({ status: 200, body: rsvpState(options.answered ?? true) }),
      "GET /api/programme": () => ({ status: 200, body: programme }),
      "GET /api/dialogues/willkommen": () => ({
        status: 200,
        body: {
          id: "willkommen",
          npcName: "Brautpaar",
          lines: ["Schön, dass ihr da seid!"],
          portrait: null,
        },
      }),
    });
  }
  const throughFirstEntry = async () => {
    await screen.findByRole("heading", { name: "Wie siehst du aus?" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
    });
    user.click(screen.getByRole("button", { name: "Weiter" }));
    await screen.findByRole("heading", { name: "Sag hallo" });
    user.click(screen.getByRole("button", { name: "Überspringen" }));
    await screen.findByTestId("game-canvas");
  };

  it("[GAME-17] the picked welcome dialogue opens once at the end of the first entry, and nothing else (no hint) shows", async () => {
    welcomeSetup({ welcome: "willkommen" });
    renderAt("/game");
    await throughFirstEntry();
    const welcome = await screen.findByRole("dialog", { name: "Brautpaar" });
    // The line types itself out (CNT-10).
    await waitFor(() => {
      expect(welcome).toHaveTextContent("Schön, dass ihr da seid!");
    });
    expect(screen.queryByText(/die funkeln/)).toBeNull();
  });

  it("[GAME-17] without a welcome dialogue nothing opens after the first entry", async () => {
    welcomeSetup({ welcome: null });
    renderAt("/game");
    await throughFirstEntry();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/die funkeln/)).toBeNull();
  });

  it("[GAME-13][GAME-17] an open RSVP comes first: the welcome opens when its overlay is closed", async () => {
    welcomeSetup({ welcome: "willkommen", answered: false });
    renderAt("/game");
    await throughFirstEntry();
    const rsvp = await screen.findByRole("dialog", { name: "Anmeldung" });
    expect(screen.queryByRole("dialog", { name: "Brautpaar" })).toBeNull();
    user.click(within(rsvp).getByRole("button", { name: /schliessen/i }));
    expect(await screen.findByRole("dialog", { name: "Brautpaar" })).toBeVisible();
  });

  it("[GAME-17] a guest who already has a figure enters without the welcome", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/world": () => ({
        status: 200,
        body: { ...world, welcomeDialogue: "willkommen" },
      }),
      "GET /api/avatar": () => ({ status: 200, body: { persons: [person(true)] } }),
      "GET /api/rsvp": () => ({ status: 200, body: rsvpState(true) }),
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    renderAt("/game");
    expect(await screen.findByTestId("game-canvas")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
