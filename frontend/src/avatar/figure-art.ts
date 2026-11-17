// The pictures of a figure for the avatar editor (sw-architecture.md 7.3, 14.4): its standing pose and the frames of
// its walk facing the player, as the URLs under the active world's import id. The editor shows them as images; the
// game draws the same frames with the engine.
import { pixelLabMetadataSchema, publicWorldSchema } from "@zappaloo/shared";
import { worldBase } from "../game/world-base.ts";

export interface FigureArt {
  /** The standing pose, facing the player. */
  stand: string;
  /** The walk frames, facing the player, in the order they play. */
  walk: string[];
}

const cache = new Map<string, Promise<Map<string, FigureArt>>>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as unknown;
}

async function load(): Promise<Map<string, FigureArt>> {
  const summary = publicWorldSchema.nullable().parse(await fetchJson("/api/world"));
  const art = new Map<string, FigureArt>();
  if (summary === null) return art;
  const base = worldBase(summary.version);
  for (const figure of summary.figures) {
    const metadata = pixelLabMetadataSchema.parse(
      await fetchJson(`${base}/avatar/${figure.metadata}`),
    );
    const state = metadata.states[0];
    if (state === undefined) continue;
    const folder = figure.metadata.includes("/")
      ? figure.metadata.slice(0, figure.metadata.lastIndexOf("/") + 1)
      : "";
    const url = (path: string) => `${base}/avatar/${folder}${path}`;
    art.set(figure.id, {
      stand: url(state.frames.rotations.south),
      walk: state.frames.animations.walking.south.map(url),
    });
  }
  return art;
}

/** The pictures of every figure of the active world; loaded once per page load. */
export function loadFigureArt(): Promise<Map<string, FigureArt>> {
  let loading = cache.get("world");
  if (loading === undefined) {
    loading = load();
    cache.set("world", loading);
    // A failed load is tried again next time.
    loading.catch(() => {
      cache.delete("world");
    });
  }
  return loading;
}

/** Forgets what was loaded (a new world has new pictures; the tests start fresh). */
export function resetFigureArt(): void {
  cache.clear();
}
