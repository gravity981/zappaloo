import { buildTestWorld } from "../../../backend/src/world/build.ts";
import { describe, expect, it, vi } from "vitest";
import { PreviewPackageStore } from "./package-store.ts";
import { TiledSourcePreview } from "./source-preview.ts";

const sourceInfo = {
  available: true,
  message: "Local Tiled source is ready.",
  mapIds: ["kirche"],
};

function createSource(exporter: (startMap: string) => Promise<Buffer>) {
  const packages = new PreviewPackageStore();
  const source = new TiledSourcePreview(packages, exporter, () => Promise.resolve(sourceInfo));
  return { packages, source };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("local Tiled source preview (MAP-18)", () => {
  it("[MAP-18][MAP-06][MAP-16] publishes only validated snapshots and retains the last success on failure", async () => {
    const exporter = vi
      .fn<(_: string) => Promise<Buffer>>()
      .mockResolvedValueOnce(buildTestWorld())
      .mockRejectedValueOnce(new Error("Tiled export failed"))
      .mockResolvedValueOnce(buildTestWorld());
    const { packages, source } = createSource(exporter);

    const first = await source.start("kirche");
    const firstToken = first.snapshot?.token;
    expect(first.revision).toBe(1);
    expect(firstToken).toBeDefined();
    expect(first.error).toBeUndefined();

    source.sourceChanged();
    await wait(350);
    expect(source.status().error?.message).toBe("Tiled export failed");
    expect(source.status().snapshot?.token).toBe(firstToken);
    expect(packages.file(firstToken ?? "", "maps/kirche.json")).toBeDefined();

    source.sourceChanged();
    await wait(350);
    const recovered = source.status();
    expect(recovered.error).toBeUndefined();
    expect(recovered.revision).toBe(2);
    expect(recovered.snapshot?.token).not.toBe(firstToken);
    expect(packages.file(firstToken ?? "", "maps/kirche.json")).toBeUndefined();
  });

  it("[MAP-18] debounces edits, serializes exports and discards stale output", async () => {
    let finishFirstExport: (() => void) | undefined;
    const firstExport = new Promise<void>((resolve) => {
      finishFirstExport = () => {
        resolve();
      };
    });
    let activeExports = 0;
    let maximumConcurrentExports = 0;
    const exporter = vi.fn(async () => {
      activeExports++;
      maximumConcurrentExports = Math.max(maximumConcurrentExports, activeExports);
      if (exporter.mock.calls.length === 1) await firstExport;
      activeExports--;
      return buildTestWorld();
    });
    const { source } = createSource(exporter);
    const starting = source.start("kirche");
    await vi.waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    source.sourceChanged();
    await wait(100);
    source.sourceChanged();
    await wait(100);
    source.sourceChanged();
    await wait(350);
    expect(source.status().exporting).toBe(true);

    finishFirstExport?.();
    await starting;
    expect(exporter).toHaveBeenCalledTimes(2);
    expect(maximumConcurrentExports).toBe(1);
    expect(source.status().revision).toBe(1);
  });

  it("[MAP-18] stopping cancels a debounced source refresh", async () => {
    const exporter = vi.fn(() => Promise.resolve(buildTestWorld()));
    const { source } = createSource(exporter);
    await source.start("kirche");

    source.sourceChanged();
    source.stop();
    await wait(350);

    expect(source.status().active).toBe(false);
    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it("[MAP-18] stopping during an export prevents stale output from being published", async () => {
    let finishExport: (() => void) | undefined;
    const exportGate = new Promise<void>((resolve) => {
      finishExport = () => {
        resolve();
      };
    });
    const exporter = vi.fn(async () => {
      await exportGate;
      return buildTestWorld();
    });
    const { source } = createSource(exporter);
    const starting = source.start("kirche");
    await vi.waitFor(() => {
      expect(exporter).toHaveBeenCalledTimes(1);
    });

    source.stop();
    finishExport?.();
    await starting;

    expect(source.status().active).toBe(false);
    expect(source.status().snapshot).toBeUndefined();
    expect(source.status().revision).toBe(0);
  });
});
