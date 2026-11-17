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
import { avatarResponseSchema } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { exposeGame, exposeState } from "./test-hook.ts";
import { rememberedMap, rememberMap } from "./map-preference.ts";
import { loadWorld } from "./world-data.ts";

/** The figure that applies to the signed-in player; undefined when it cannot be read. */
async function ownFigure(): Promise<string | undefined> {
  const result = await apiRequest("GET", "/api/avatar");
  const parsed = avatarResponseSchema.safeParse(result.body);
  return result.ok && parsed.success ? (parsed.data.persons[0]?.figure ?? undefined) : undefined;
}

type Status =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ready"; world: LoadedWorld; figure: string | undefined };

/**
 * The game. The page above it (GAME-11) belongs to the parent: `paused` stands the game still while a page is open,
 * and `onActivate` and `onPlayerTap` tell the parent what the player used (GAME-06, GAME-18).
 */
export default function GameCanvas({
  paused,
  onActivate,
  onPlayerTap,
}: {
  paused: boolean;
  onActivate: (activation: GameActivation) => void;
  onPlayerTap: () => void;
}) {
  const { t } = useTranslation();
  const parent = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const game = useRef<GameInstance>(null);
  // The engine keeps the first callbacks it gets; these refs let it call the latest ones.
  const activate = useRef(onActivate);
  const tap = useRef(onPlayerTap);
  const translate = useRef(t);
  useEffect(() => {
    activate.current = onActivate;
    tap.current = onPlayerTap;
    translate.current = t;
  });

  useEffect(() => {
    let active = true;
    // The world, and the figure the player chose in the avatar editor (AVA-04); without one, the world's first.
    Promise.all([loadWorld(), ownFigure()]).then(
      ([world, figure]) => {
        if (active) {
          setStatus(world === undefined ? { kind: "none" } : { kind: "ready", world, figure });
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
    const instance = createGame({
      parent: parent.current,
      world: status.world,
      host: {
        selection: { ...selection, ...(figureId === undefined ? {} : { figureId }) },
        rememberMap: (mapId) => {
          rememberMap(mapId, storage);
        },
        onStateChange: exposeState,
        onActivate: (activation) => {
          activate.current(activation);
        },
        onPlayerTap: () => {
          tap.current();
        },
      },
      // The words the engine shows come from the app, in the guest's language.
      texts: { loading: translate.current("game.mapLoading") },
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
