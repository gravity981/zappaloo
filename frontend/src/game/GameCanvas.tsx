// Loads the active world and mounts the reusable engine, then destroys it on unmount. This module (and Phaser with
// it) is loaded lazily with the game route. Without an imported world, the guest is told so.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createGame,
  entryPoint,
  setGameFigure,
  setGamePaused,
  type GameActivation,
  type GameInstance,
  type LoadedWorld,
} from "@zappaloo/game-engine";
import {
  avatarResponseSchema,
  contentResponseSchema,
  guestFiguresResponseSchema,
} from "@zappaloo/shared";
import type { GuestFigure } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { exposeGame, exposeState, seedRandomForTests } from "./test-hook.ts";
import { rememberedMap, rememberMap } from "./map-preference.ts";
import { objectTitle } from "./titles.ts";
import { accentColorAt } from "./silhouette-color.ts";
import { loadWorld } from "./world-data.ts";

/** The figure that applies to the signed-in player; undefined when it cannot be read. */
async function ownFigure(): Promise<string | undefined> {
  const result = await apiRequest("GET", "/api/avatar");
  const parsed = avatarResponseSchema.safeParse(result.body);
  return result.ok && parsed.success ? (parsed.data.persons[0]?.figure ?? undefined) : undefined;
}

/** The figures of the attending guests (PRES-01); none when they cannot be read, so the world still opens. */
async function guestFigures(): Promise<GuestFigure[]> {
  const result = await apiRequest("GET", "/api/world/guests");
  const parsed = guestFiguresResponseSchema.safeParse(result.body);
  return result.ok && parsed.success ? parsed.data.guests : [];
}

/** The titles of the content pages by their slugs, for the labels of the objects (GAME-40); none when unreadable. */
async function pageTitles(): Promise<Map<string, string>> {
  const result = await apiRequest("GET", "/api/content");
  const parsed = contentResponseSchema.safeParse(result.body);
  return result.ok && parsed.success
    ? new Map(parsed.data.pages.map((page) => [page.slug, page.title]))
    : new Map();
}

type Status =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed" }
  | {
      kind: "ready";
      world: LoadedWorld;
      figure: string | undefined;
      guests: GuestFigure[];
      titles: Map<string, string>;
    };

function silhouetteOption(element: Element): { silhouetteColor?: number } {
  const silhouetteColor = accentColorAt(element);
  return silhouetteColor === undefined ? {} : { silhouetteColor };
}

/**
 * The game. The page above it (GAME-11) belongs to the parent: `paused` stands the game still while a page is open,
 * and `onActivate` tells the parent what the player used (GAME-06).
 */
export default function GameCanvas({
  paused,
  onActivate,
}: {
  paused: boolean;
  onActivate: (activation: GameActivation) => void;
}) {
  const { t } = useTranslation();
  const parent = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const game = useRef<GameInstance>(null);
  // The engine keeps the first callbacks it gets; these refs let it call the latest ones.
  const activate = useRef(onActivate);
  const translate = useRef(t);
  useEffect(() => {
    activate.current = onActivate;
    translate.current = t;
  });

  useEffect(() => {
    let active = true;
    // The world, and the figure the player chose in the avatar editor (AVA-04); without one, the world's first.
    Promise.all([loadWorld(), ownFigure(), guestFigures(), pageTitles()]).then(
      ([world, figure, guests, titles]) => {
        if (active) {
          setStatus(
            world === undefined
              ? { kind: "none" }
              : { kind: "ready", world, figure, guests, titles },
          );
        }
      },
      () => {
        if (active) setStatus({ kind: "failed" });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (status.kind !== "ready" || !parent.current) return;
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
    const selection = entryPoint(status.world, rememberedMap(status.world, storage));
    const figureId = status.figure ?? status.world.figures[0]?.id;
    seedRandomForTests();
    const instance = createGame({
      parent: parent.current,
      world: status.world,
      guests: status.guests,
      host: {
        selection: { ...selection, ...(figureId === undefined ? {} : { figureId }) },
        rememberMap: (mapId) => {
          rememberMap(mapId, storage);
        },
        onStateChange: exposeState,
        onActivate: (activation) => {
          activate.current(activation);
        },
      },
      // The words the engine shows come from the app, in the guest's language.
      texts: {
        loading: translate.current("game.mapLoading"),
        closeBubble: translate.current("game.bubbleClose"),
        defaultGreeting: translate.current("game.defaultGreeting"),
      },
      // The title of what an object opens names its edge indicator and its label (GAME-40): the title of a page.
      // A dialogue has none (objects that show one have no indicator or label), nor has a minigame yet (stage 8).
      titleOf: (action) => objectTitle(action, translate.current, status.titles),
      // The photo of a guest for the speech bubble (PRES-10); the version lets the browser keep it.
      guestPhoto: (guest) =>
        guest.photo === null
          ? undefined
          : `/api/world/guests/${guest.id}/photo?v=${String(guest.photo)}`,
      // The silhouettes of figures behind objects are in the event's accent colour (GAME-42).
      ...silhouetteOption(parent.current),
      transparent: import.meta.env.VITE_TEST_HOOKS === "true",
      preserveDrawingBuffer: import.meta.env.VITE_TEST_HOOKS === "true",
      // The frame diagnostics (GAME-27) exist on the dev server only; a production build drops them.
      diagnostics:
        import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get("debug") === "frames",
    });
    game.current = instance;
    exposeGame(instance);
    return () => {
      exposeGame(null);
      game.current = null;
      instance.destroy(true);
    };
  }, [status]);

  // The game stands still while a page is open, and goes on at the same spot when it is closed.
  useEffect(() => {
    if (!game.current) return undefined;
    setGamePaused(game.current, paused);
    if (paused) return undefined;
    // A page may have changed the avatar (the profile leads to the editor): the player wears the new figure.
    let active = true;
    void ownFigure().then((figure) => {
      if (active && figure !== undefined && game.current) setGameFigure(game.current, figure);
    });
    return () => {
      active = false;
    };
  }, [paused, status]);

  if (status.kind === "loading") return <p>{t("game.loading")}</p>;
  if (status.kind === "none") return <p>{t("game.noWorld")}</p>;
  if (status.kind === "failed") return <p role="alert">{t("game.loadFailed")}</p>;
  return <div ref={parent} className="game-canvas" data-testid="game-canvas" />;
}
