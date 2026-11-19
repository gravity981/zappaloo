import { prepareWorld } from "@zappaloo/game-engine";
import { buildTestWorld } from "../../backend/src/world/build.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewPackageStore } from "./server/package-store.ts";

vi.mock("@zappaloo/game-engine", () => ({
  prepareWorld: vi.fn(() => ({
    maps: new Map(),
    figures: [],
    images: new Map(),
  })),
}));

import { loadPreviewSnapshot } from "./package-loader.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("standalone preview snapshot loading (MAP-18)", () => {
  it("[MAP-18][MAP-06][MAP-16] prepares local-package snapshots through the shared world loader", async () => {
    const packages = new PreviewPackageStore();
    const upload = packages.upload(buildTestWorld());
    if (!upload.ok) throw new Error("the generated public world must pass validation");

    const requests: { url: string; method: string | undefined }[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requests.push({ url, method: init?.method });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const preview = await loadPreviewSnapshot(upload.preview, "local-package");

    expect(preview.source).toBe("local-package");
    expect(preview.token).toBe(upload.preview.token);
    expect(preview.file).toBeUndefined();
    expect(prepareWorld).toHaveBeenCalledWith(
      expect.objectContaining({ summary: upload.preview.summary }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(
      upload.preview.summary.maps.length +
        new Set(upload.preview.summary.figures.map((figure) => figure.metadata)).size +
        // The bird of a world of format version 3 is one more file (its metadata).
        (upload.preview.summary.bird ? 1 : 0),
    );
    expect(requests.some(({ method }) => method === "DELETE" || method === "POST")).toBe(false);
    preview.releaseAssets();
  });
});
