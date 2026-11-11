// The full-screen door scene behind the waiting page (ACS-12): the built-in scene, or the
// event's own sprite sheet. It fills its parent, redraws on every frame and reacts to a tap on
// the gap. Without animation (reduced motion) the scene stands still.
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { DoorResponse } from "@zappaloo/shared";
import { createDefaultScene } from "./defaultScene.ts";
import type { Scene } from "./defaultScene.ts";
import { createSheetScene } from "./sheetScene.ts";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(`image not loaded: ${url}`));
    };
    image.src = url;
  });
}

export default function DoorScene({ door }: { door: DoorResponse }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: Scene | undefined;
    let frame = 0;
    let stopped = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** The canvas gets the size of its parent in device pixels. */
    function resize() {
      if (!canvas) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    }
    resize();
    window.addEventListener("resize", resize);
    // The scene decides whether a tap hit the gap (the easter egg).
    const onTap = (event: PointerEvent) => {
      scene?.tap(event.clientX, event.clientY, performance.now());
    };
    canvas.addEventListener("pointerdown", onTap);

    const loop = (time: number) => {
      scene?.draw(time);
      if (!stopped) frame = requestAnimationFrame(loop);
    };
    const start = (next: Scene | undefined) => {
      if (stopped || !next) return;
      scene = next;
      frame = requestAnimationFrame(loop);
    };

    if (door.kind === "default") {
      start(createDefaultScene(canvas, reduced));
    } else {
      const query = `?v=${encodeURIComponent(door.version)}`;
      void Promise.all([
        loadImage(`/api/waiting/door/sheet${query}`),
        door.glimpse ? loadImage(`/api/waiting/door/glimpse${query}`) : undefined,
      ])
        .then(([sheet, glimpse]) => {
          start(createSheetScene(canvas, door.sheet, { sheet, glimpse }, reduced));
        })
        // A broken file never breaks the page: the built-in scene takes over.
        .catch(() => {
          start(createDefaultScene(canvas, reduced));
        });
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onTap);
    };
  }, [door]);

  return (
    <canvas
      ref={canvasRef}
      className="door-scene"
      role="img"
      aria-label={t("waiting.sceneLabel")}
    />
  );
}
