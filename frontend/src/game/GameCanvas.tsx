// Loads the active world and mounts Phaser with the world scene, then destroys it on unmount. This module (and
// Phaser with it) is loaded lazily with the game route. Without an imported world, the guest is told so.
import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { exposeGame } from "./test-hook.ts";
import { WORLD_REGISTRY_KEY, WorldScene } from "./GameScene.ts";
import { loadWorld } from "./world-data.ts";
import type { LoadedWorld } from "./world-data.ts";

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
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current,
      pixelArt: true,
      transparent: import.meta.env.VITE_TEST_HOOKS === "true",
      render: { preserveDrawingBuffer: import.meta.env.VITE_TEST_HOOKS === "true" },
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene: [WorldScene],
    });
    game.registry.set(WORLD_REGISTRY_KEY, status.world);
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
