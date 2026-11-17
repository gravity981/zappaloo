// Loads the active world and mounts the reusable engine, then destroys it on unmount. This module (and Phaser with
// it) is loaded lazily with the game route. Without an imported world, the guest is told so.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createGame, entryPoint, type LoadedWorld } from "@zappaloo/game-engine";
import { exposeGame, exposeState } from "./test-hook.ts";
import { rememberedMap, rememberMap } from "./map-preference.ts";
import { loadWorld } from "./world-data.ts";

type Status =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ready"; world: LoadedWorld };

export default function GameCanvas() {
  const { t } = useTranslation();
  const parent = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    loadWorld().then(
      (world) => {
        if (active) setStatus(world === undefined ? { kind: "none" } : { kind: "ready", world });
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
    const figureId = status.world.figures[0]?.id;
    const game = createGame({
      parent: parent.current,
      world: status.world,
      host: {
        selection: { ...selection, ...(figureId === undefined ? {} : { figureId }) },
        rememberMap: (mapId) => {
          rememberMap(mapId, storage);
        },
        onStateChange: exposeState,
      },
      transparent: import.meta.env.VITE_TEST_HOOKS === "true",
      preserveDrawingBuffer: import.meta.env.VITE_TEST_HOOKS === "true",
    });
    exposeGame(game);
    return () => {
      exposeGame(null);
      game.destroy(true);
    };
  }, [status]);

  if (status.kind === "loading") return <p>{t("game.loading")}</p>;
  if (status.kind === "none") return <p>{t("game.noWorld")}</p>;
  if (status.kind === "failed") return <p role="alert">{t("game.loadFailed")}</p>;
  return <div ref={parent} className="game-canvas" data-testid="game-canvas" />;
}
