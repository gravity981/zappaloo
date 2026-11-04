// Mounts Phaser into a React component and destroys it on unmount.
// This module (and Phaser with it) is loaded lazily with the game route.
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { EmptyScene } from "./scenes.ts";
import { exposeGame } from "./test-hook.ts";

export default function GameCanvas() {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current,
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene: [EmptyScene],
    });
    exposeGame(game);
    return () => {
      exposeGame(null);
      game.destroy(true);
    };
  }, []);

  return <div ref={parent} className="game-canvas" data-testid="game-canvas" />;
}
