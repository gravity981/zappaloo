// The pictures of a figure in the avatar editor: a still one for the grid, and the walking preview (the walk
// frames, one after the other at 8 frames per second, like the game plays them; still when the guest prefers
// reduced motion).
import { useEffect, useState } from "react";
import type { FigureArt } from "./figure-art.ts";

const FRAMES_PER_SECOND = 8;

/** A pixel-art picture, scaled up without smoothing. */
export function FigureImage({ url, scale = 3 }: { url: string | undefined; scale?: number }) {
  if (url === undefined) return <span className="figure-missing" />;
  return (
    <img className="figure-img" src={url} alt="" style={{ height: `${String(scale * 16)}px` }} />
  );
}

/** The walking preview; it starts again at the first frame for another figure (the parent keys it). */
export function FigurePreview({ art }: { art: FigureArt }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || art.walk.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % art.walk.length);
    }, 1000 / FRAMES_PER_SECOND);
    return () => {
      window.clearInterval(timer);
    };
  }, [art]);
  return <FigureImage url={art.walk[frame] ?? art.stand} scale={8} />;
}
