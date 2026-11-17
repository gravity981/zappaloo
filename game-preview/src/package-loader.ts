import { prepareWorld, type LoadedWorld } from "@zappaloo/game-engine";
import {
  publicWorldSchema,
  worldFindingSchema,
  type PublicWorld,
  type WorldFindingDto,
} from "@zappaloo/shared";
import { z } from "zod";

const API = "/__game-preview/api";
const uploadSchema = z.strictObject({
  token: z.uuid(),
  summary: publicWorldSchema,
  findings: z.array(worldFindingSchema),
});
const failureSchema = z.object({
  error: z.string().optional(),
  findings: z.array(worldFindingSchema).optional(),
});
export const sourceStatusSchema = z.strictObject({
  available: z.boolean(),
  message: z.string(),
  mapIds: z.array(z.string()),
  active: z.boolean(),
  exporting: z.boolean(),
  revision: z.number().int().nonnegative(),
  snapshot: uploadSchema.optional(),
  error: z
    .strictObject({
      message: z.string(),
      findings: z.array(worldFindingSchema),
    })
    .optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export class PreviewLoadError extends Error {
  readonly findings: WorldFindingDto[];

  constructor(message: string, findings: WorldFindingDto[] = []) {
    super(message);
    this.name = "PreviewLoadError";
    this.findings = findings;
  }
}

export interface LoadedPreview {
  token: string;
  source: "package" | "tiled";
  summary: PublicWorld;
  world: LoadedWorld;
  findings: WorldFindingDto[];
  file?: File;
  snapshot: z.infer<typeof uploadSchema>;
  releaseAssets: () => void;
}

function packageFileUrl(token: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/packages/${token}/files/${encodedPath}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as unknown;
}

async function upload(file: File): Promise<z.infer<typeof uploadSchema>> {
  const response = await fetch(`${API}/packages`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/gzip" },
    body: file,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const failure = failureSchema.safeParse(payload);
    if (failure.success) {
      throw new PreviewLoadError(
        failure.data.error ?? "The package was refused",
        failure.data.findings ?? [],
      );
    }
    throw new PreviewLoadError(`The preview server answered ${String(response.status)}`);
  }
  return uploadSchema.parse(payload);
}

async function loadAsset(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return objectUrl;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new Error(`Could not decode image ${url}`, { cause: error });
  }
}

async function prepareAssets(world: LoadedWorld): Promise<() => void> {
  const objectUrls = new Set<string>();
  const bySourceUrl = new Map<string, string>();
  try {
    for (const [key, sourceUrl] of world.images) {
      let objectUrl = bySourceUrl.get(sourceUrl);
      if (objectUrl === undefined) {
        objectUrl = await loadAsset(sourceUrl);
        bySourceUrl.set(sourceUrl, objectUrl);
        objectUrls.add(objectUrl);
      }
      world.images.set(key, objectUrl);
    }
  } catch (error) {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    throw error;
  }
  return () => {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  };
}

export async function releasePreviewPackage(token: string): Promise<void> {
  const response = await fetch(`${API}/packages/${token}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Could not release preview package ${token}: ${String(response.status)}`);
  }
}

/** Validates through the local server, prepares through the shared engine, then verifies every image before use. */
export async function loadPreviewSnapshot(
  snapshot: unknown,
  source: LoadedPreview["source"],
  file?: File,
): Promise<LoadedPreview> {
  const uploaded = uploadSchema.parse(snapshot);
  const { token, summary } = uploaded;
  let releaseAssets: (() => void) | undefined;
  try {
    const maps = new Map<string, unknown>();
    for (const id of summary.maps) {
      maps.set(id, await fetchJson(packageFileUrl(token, `maps/${id}.json`)));
    }
    const figureMetadata = new Map<string, unknown>();
    for (const figure of summary.figures) {
      if (!figureMetadata.has(figure.metadata)) {
        figureMetadata.set(
          figure.metadata,
          await fetchJson(packageFileUrl(token, `avatar/${figure.metadata}`)),
        );
      }
    }

    const world = prepareWorld({
      summary,
      maps,
      figureMetadata,
      resolveAsset: (path) => packageFileUrl(token, path),
    });
    releaseAssets = await prepareAssets(world);
    return {
      token,
      source,
      summary,
      world,
      findings: uploaded.findings,
      ...(file === undefined ? {} : { file }),
      snapshot: uploaded,
      releaseAssets,
    };
  } catch (error) {
    releaseAssets?.();
    if (source === "package") {
      try {
        await releasePreviewPackage(token);
      } catch (releaseError) {
        console.error("Could not release a failed preview package", releaseError);
      }
    }
    throw error;
  }
}

/** Validates through the local server, prepares through the shared engine, then verifies every image before use. */
export async function loadPreviewPackage(file: File): Promise<LoadedPreview> {
  return loadPreviewSnapshot(await upload(file), "package", file);
}
