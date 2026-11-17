import { PreviewPackageStore } from "./package-store.ts";
import {
  exportTiledSource,
  getTiledSourceInfo,
  resolveTiledSourceRoot,
  TiledSourceError,
} from "./tiled-source.ts";
import type { TiledSourceInfo } from "./tiled-source.ts";
import type { PreviewPackage } from "./package-store.ts";

export interface TiledSourcePreviewStatus {
  available: boolean;
  message: string;
  mapIds: string[];
  active: boolean;
  exporting: boolean;
  revision: number;
  snapshot?: PreviewPackage;
  error?: { message: string; findings: TiledSourceError["findings"] };
}

type Exporter = (startMap: string) => Promise<Buffer>;
type Inspector = () => Promise<TiledSourceInfo>;

export class TiledSourcePreview {
  #packages: PreviewPackageStore;
  #exporter: Exporter;
  #inspector: Inspector;
  #info: TiledSourceInfo = {
    available: false,
    message: "Checking local Tiled source configuration…",
    mapIds: [],
  };
  #active = false;
  #startMap: string | undefined;
  #snapshot: PreviewPackage | undefined;
  #error: TiledSourcePreviewStatus["error"];
  #revision = 0;
  #exporting = false;
  #queued = false;
  #generation = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #watchRoot: string | undefined;

  #isActive(): boolean {
    return this.#active;
  }

  #hasQueuedRefresh(): boolean {
    return this.#queued;
  }

  constructor(
    packages: PreviewPackageStore,
    exporter: Exporter = exportTiledSource,
    inspector: Inspector = getTiledSourceInfo,
  ) {
    this.#packages = packages;
    this.#exporter = exporter;
    this.#inspector = inspector;
  }

  async initialize(): Promise<string | undefined> {
    try {
      this.#watchRoot = await resolveTiledSourceRoot();
    } catch {
      this.#watchRoot = undefined;
    }
    await this.#refreshInfo();
    return this.#watchRoot;
  }

  status(): TiledSourcePreviewStatus {
    return {
      available: this.#info.available,
      message: this.#info.message,
      mapIds: this.#info.mapIds,
      active: this.#active,
      exporting: this.#exporting,
      revision: this.#revision,
      ...(this.#snapshot === undefined ? {} : { snapshot: this.#snapshot }),
      ...(this.#error === undefined ? {} : { error: this.#error }),
    };
  }

  async start(startMap: string): Promise<TiledSourcePreviewStatus> {
    this.#generation++;
    this.#active = true;
    this.#startMap = startMap;
    await this.#refresh();
    return this.status();
  }

  stop(): TiledSourcePreviewStatus {
    this.#generation++;
    this.#active = false;
    this.#startMap = undefined;
    this.#queued = false;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    return this.status();
  }

  sourceChanged(): void {
    this.#generation++;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#refresh();
    }, 300);
  }

  async #refreshInfo(): Promise<void> {
    this.#info = await this.#inspector();
  }

  async #refresh(): Promise<void> {
    if (this.#exporting) {
      this.#queued = true;
      return;
    }
    this.#exporting = true;
    try {
      do {
        this.#queued = false;
        await this.#refreshInfo();
        if (this.#active) await this.#publish();
      } while (this.#hasQueuedRefresh());
    } catch (error) {
      this.#setError(error);
    } finally {
      this.#exporting = false;
    }
  }

  async #publish(): Promise<void> {
    if (!this.#isActive()) return;
    const startMap = this.#startMap;
    const generation = this.#generation;
    if (!this.#info.available) {
      this.#setError(new Error(this.#info.message));
      return;
    }
    if (startMap === undefined || !this.#info.mapIds.includes(startMap)) {
      this.#setError(
        new Error(`Start map ${startMap ?? "(not selected)"} is no longer available.`),
      );
      return;
    }
    try {
      const archive = await this.#exporter(startMap);
      if (!this.#isActive() || this.#startMap !== startMap || generation !== this.#generation) {
        return;
      }
      const uploaded = this.#packages.upload(archive);
      if (generation !== this.#generation) return;
      if (!uploaded.ok) {
        this.#error = {
          message: "The exported Tiled source does not pass world validation.",
          findings: uploaded.findings,
        };
        return;
      }
      const previousToken = this.#snapshot?.token;
      this.#snapshot = uploaded.preview;
      if (previousToken !== undefined) this.#packages.delete(previousToken);
      this.#revision++;
      this.#error = undefined;
    } catch (error) {
      if (generation === this.#generation) this.#setError(error);
    }
  }

  #setError(error: unknown): void {
    const findings = error instanceof TiledSourceError ? error.findings : [];
    this.#error = {
      message: error instanceof Error ? error.message : String(error),
      findings,
    };
  }
}
