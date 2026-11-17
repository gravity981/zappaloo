// Authenticated transport for the active world (MAP-10, AVA-02). Preparation is shared with the engine so that
// preview adapters can provide local package data and a different asset URL resolver.
import { publicWorldSchema } from "@zappaloo/shared";
import { prepareWorld, type LoadedWorld } from "@zappaloo/game-engine";

/** The base of the world's files for an import id. */
export function worldBase(version: string): string {
  return `/api/world/${version}`;
}

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
  const maps = new Map<string, unknown>();
  for (const id of summary.maps) {
    maps.set(id, await fetchJson(`${base}/maps/${id}.json`));
  }

  const figureMetadata = new Map<string, unknown>();
  for (const figure of summary.figures) {
    if (!figureMetadata.has(figure.metadata)) {
      figureMetadata.set(figure.metadata, await fetchJson(`${base}/avatar/${figure.metadata}`));
    }
  }

  return prepareWorld({
    summary,
    maps,
    figureMetadata,
    resolveAsset: (path) => `${base}/${path}`,
  });
}
