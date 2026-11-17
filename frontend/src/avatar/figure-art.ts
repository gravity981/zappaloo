// The pictures of a figure for the avatar editor (sw-architecture.md 7.3, 14.4): its standing pose and the frames of
// its walk facing the player, as the URLs under the active world's import id. The editor shows them as images; the
// game draws the same frames with the engine.
import { pixelLabMetadataSchema, publicWorldSchema } from "@zappaloo/shared";
import type { PublicWorld } from "@zappaloo/shared";
import { worldBase } from "../game/world-base.ts";

export interface FigureArt {
  /** The standing pose, facing the player. */
  stand: string;
  /** The walk frames, facing the player, in the order they play. */
  walk: string[];
}

/** The pictures per world: keyed by the world's version (its import id), so a new import has its own pictures. */
const cache = new Map<string, Promise<Map<string, FigureArt>>>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as unknown;
}

/** The figure's pictures, read from its metadata; the metadata files of all figures are read in parallel. */
async function artOf(summary: PublicWorld): Promise<Map<string, FigureArt>> {
  const base = worldBase(summary.version);
  const entries = await Promise.all(
    summary.figures.map(async (figure) => {
      const metadata = pixelLabMetadataSchema.parse(
        await fetchJson(`${base}/avatar/${figure.metadata}`),
      );
      const state = metadata.states[0];
      if (state === undefined) return undefined;
      const folder = figure.metadata.includes("/")
        ? figure.metadata.slice(0, figure.metadata.lastIndexOf("/") + 1)
        : "";
      const url = (path: string) => `${base}/avatar/${folder}${path}`;
      const art: FigureArt = {
        stand: url(state.frames.rotations.south),
        walk: state.frames.animations.walking.south.map(url),
      };
      return [figure.id, art] as const;
    }),
  );
  return new Map(entries.filter((entry) => entry !== undefined));
}

/** The pictures of every figure of the active world; loaded once per world and page load. */
export async function loadFigureArt(): Promise<Map<string, FigureArt>> {
  const summary = publicWorldSchema.nullable().parse(await fetchJson("/api/world"));
  if (summary === null) return new Map();
  let loading = cache.get(summary.version);
  if (loading === undefined) {
    loading = artOf(summary);
    cache.set(summary.version, loading);
    // A failed load is tried again next time.
    loading.catch(() => {
      cache.delete(summary.version);
    });
  }
  return loading;
}

/** Forgets what was loaded (a new world has new pictures; the tests start fresh). */
export function resetFigureArt(): void {
  cache.clear();
}
