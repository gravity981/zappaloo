import { randomUUID } from "node:crypto";
import { isSafePath } from "../../../backend/src/packages/archive.ts";
import { checkWorldPackage } from "../../../backend/src/world/validate.ts";
import type { WorldFinding } from "../../../backend/src/world/findings.ts";
import type { PublicWorld } from "@zappaloo/shared";

const PACKAGE_TTL_MS = 30 * 60 * 1000;

interface StoredPackage {
  files: Map<string, Buffer>;
  lastUsedAt: number;
}

export interface PreviewPackage {
  token: string;
  summary: PublicWorld;
  findings: WorldFinding[];
}

export type PackageUpload =
  { ok: true; preview: PreviewPackage } | { ok: false; findings: WorldFinding[] };

/** Keeps only validated package files in memory; no filesystem paths are accepted. */
export class PreviewPackageStore {
  #packages = new Map<string, StoredPackage>();
  /** The packages a preview shows: they are kept whatever their age (the status advertises them). */
  #pinned = new Set<string>();

  /** Keeps a package while it is shown, however long it has been idle. */
  pin(token: string): void {
    this.#pinned.add(token);
  }

  /** Lets a package expire again, once it is no longer shown. */
  unpin(token: string): void {
    this.#pinned.delete(token);
  }

  upload(archive: Buffer): PackageUpload {
    this.#expire();
    const result = checkWorldPackage(archive);
    if (!result.ok) return { ok: false, findings: result.findings };

    const token = randomUUID();
    this.#packages.set(token, { files: result.package.files, lastUsedAt: Date.now() });
    return {
      ok: true,
      preview: {
        token,
        summary: {
          version: token,
          name: result.package.manifest.name,
          startMap: result.package.manifest.startMap,
          tileWidth: result.package.manifest.tileWidth,
          tileHeight: result.package.manifest.tileHeight,
          maps: result.package.mapIds,
          figures: result.package.figures,
          // A preview has no installation: the presets of the maps apply (MAP-15).
          actions: [],
        },
        findings: result.findings,
      },
    };
  }

  file(token: string, path: string): Buffer | undefined {
    this.#expire();
    if (!isSafePath(path)) return undefined;
    const stored = this.#packages.get(token);
    if (stored === undefined) return undefined;
    stored.lastUsedAt = Date.now();
    return stored.files.get(path);
  }

  delete(token: string): boolean {
    this.#pinned.delete(token);
    return this.#packages.delete(token);
  }

  clear(): void {
    this.#packages.clear();
    this.#pinned.clear();
  }

  #expire(): void {
    const expiresBefore = Date.now() - PACKAGE_TTL_MS;
    for (const [token, stored] of this.#packages) {
      if (!this.#pinned.has(token) && stored.lastUsedAt < expiresBefore) {
        this.#packages.delete(token);
      }
    }
  }
}
