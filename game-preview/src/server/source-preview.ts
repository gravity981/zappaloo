import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { WORLD_LIMITS } from "@zappaloo/shared";
import { PreviewPackageStore } from "./package-store.ts";
import type { PreviewPackage } from "./package-store.ts";

interface PreviewError {
  message: string;
  findings: PreviewPackage["findings"];
}

export interface LocalPackagePreviewStatus {
  active: boolean;
  loading: boolean;
  revision: number;
  archivePath?: string;
  snapshot?: PreviewPackage;
  error?: PreviewError;
}

export class LocalPackagePreview {
  #packages: PreviewPackageStore;
  #active = false;
  #loading = false;
  #archivePath: string | undefined;
  #snapshot: PreviewPackage | undefined;
  #error: PreviewError | undefined;
  #revision = 0;
  #generation = 0;
  #watcher: FSWatcher | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #refreshPromise: Promise<void> | undefined;
  #queued = false;

  constructor(packages: PreviewPackageStore) {
    this.#packages = packages;
  }

  status(): LocalPackagePreviewStatus {
    return {
      active: this.#active,
      loading: this.#loading,
      revision: this.#revision,
      ...(this.#archivePath === undefined ? {} : { archivePath: this.#archivePath }),
      ...(this.#snapshot === undefined ? {} : { snapshot: this.#snapshot }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  async start(archivePath: string): Promise<LocalPackagePreviewStatus> {
    this.stop();
    if (!isAbsolute(archivePath)) {
      this.#setError(new Error("World package path must be absolute."));
      return this.status();
    }

    const absolutePath = resolve(archivePath);
    this.#archivePath = absolutePath;
    this.#active = true;
    const generation = this.#generation;
    try {
      this.#watcher = watch(dirname(absolutePath), { persistent: false }, (_event, filename) => {
        if (!this.#isCurrent(absolutePath, generation)) return;
        const changedFile = Buffer.isBuffer(filename) ? filename.toString() : filename;
        if (changedFile !== null && changedFile !== basename(absolutePath)) return;
        this.packageChanged();
      });
      this.#watcher.on("error", (error: Error) => {
        if (!this.#isCurrent(absolutePath, generation)) return;
        this.#stopWatcher();
        this.#active = false;
        this.#archivePath = undefined;
        this.#generation++;
        this.#setError(error);
      });
    } catch (error) {
      this.#active = false;
      this.#archivePath = undefined;
      this.#setError(error);
      return this.status();
    }

    await this.#refresh();
    return this.status();
  }

  stop(): LocalPackagePreviewStatus {
    this.#generation++;
    this.#active = false;
    this.#loading = false;
    this.#archivePath = undefined;
    this.#error = undefined;
    this.#queued = false;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#stopWatcher();
    return this.status();
  }

  packageChanged(): void {
    if (!this.#active) return;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#refresh();
    }, 300);
  }

  #stopWatcher(): void {
    this.#watcher?.close();
    this.#watcher = undefined;
  }

  #isCurrent(archivePath: string, generation: number): boolean {
    return this.#active && this.#archivePath === archivePath && this.#generation === generation;
  }

  #isGenerationCurrent(generation: number): boolean {
    return this.#generation === generation;
  }

  #hasQueuedRefresh(): boolean {
    return this.#queued;
  }

  #setError(error: unknown, findings: PreviewPackage["findings"] = []): void {
    this.#error = {
      message: error instanceof Error ? error.message : String(error),
      findings,
    };
  }

  #refresh(): Promise<void> {
    if (this.#refreshPromise !== undefined) {
      this.#queued = true;
      return this.#refreshPromise;
    }
    this.#refreshPromise = this.#refreshLoop().finally(() => {
      this.#refreshPromise = undefined;
    });
    return this.#refreshPromise;
  }

  async #refreshLoop(): Promise<void> {
    do {
      this.#queued = false;
      const archivePath = this.#archivePath;
      const generation = this.#generation;
      if (!this.#active || archivePath === undefined) return;
      this.#loading = true;
      try {
        const info = await stat(archivePath);
        if (!info.isFile()) throw new Error("World package path must point to a regular file.");
        if (info.size > WORLD_LIMITS.archiveBytes) {
          throw new Error(`World package exceeds ${String(WORLD_LIMITS.archiveBytes)} bytes.`);
        }
        const archive = await readFile(archivePath);
        if (archive.length > WORLD_LIMITS.archiveBytes) {
          throw new Error(`World package exceeds ${String(WORLD_LIMITS.archiveBytes)} bytes.`);
        }
        if (!this.#isCurrent(archivePath, generation)) continue;

        const uploaded = this.#packages.upload(archive);
        if (!uploaded.ok) {
          this.#setError(
            new Error("The selected world package does not pass validation."),
            uploaded.findings,
          );
          continue;
        }

        const previousToken = this.#snapshot?.token;
        this.#snapshot = uploaded.preview;
        this.#revision++;
        this.#error = undefined;
        if (previousToken !== undefined) this.#packages.delete(previousToken);
      } catch (error) {
        if (this.#isCurrent(archivePath, generation)) this.#setError(error);
      } finally {
        if (this.#isGenerationCurrent(generation)) this.#loading = false;
      }
    } while (this.#hasQueuedRefresh());
  }
}
