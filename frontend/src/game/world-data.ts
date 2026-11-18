// Authenticated transport for the active world (MAP-10, AVA-02). Preparation is shared with the engine so that
// preview adapters can provide local package data and a different asset URL resolver.
import { publicWorldSchema, WORLD_BIRD_METADATA } from "@zappaloo/shared";
import { prepareWorld, type LoadedWorld } from "@zappaloo/game-engine";
import { worldBase } from "./world-base.ts";

export { worldBase };

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as unknown;
}

/** Loads the active world; undefined when no world is imported. */
export async function loadWorld(): Promise<LoadedWorld | undefined> {
  const summary = publicWorldSchema.nullable().parse(await fetchJson("/api/world"));
  if (summary === null) return undefined;
  const base = worldBase(summary.version);
  // The maps and the figures' metadata are independent of each other: they are read in parallel.
  const maps = new Map<string, unknown>(
    await Promise.all(
      summary.maps.map(async (id) => [id, await fetchJson(`${base}/maps/${id}.json`)] as const),
    ),
  );
  const metadataPaths = [...new Set(summary.figures.map((figure) => figure.metadata))];
  const figureMetadata = new Map<string, unknown>(
    await Promise.all(
      metadataPaths.map(async (path) => [path, await fetchJson(`${base}/avatar/${path}`)] as const),
    ),
  );

  // Format version 3: the bird that now and then flies through the view, when the world has one (GAME-32).
  const birdMetadata = summary.bird ? await fetchJson(`${base}/${WORLD_BIRD_METADATA}`) : undefined;

  return prepareWorld({
    summary,
    maps,
    figureMetadata,
    ...(birdMetadata === undefined ? {} : { birdMetadata }),
    resolveAsset: (path) => `${base}/${path}`,
  });
}
