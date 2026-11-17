import { describe, expect, it } from "vitest";
import { buildTestWorld } from "../../../backend/src/world/build.ts";
import { PreviewPackageStore } from "./package-store.ts";

describe("validated preview package storage (MAP-06, MAP-16)", () => {
  it("[MAP-06][MAP-16] stores only validated package files and scopes reads to that package", () => {
    const store = new PreviewPackageStore();
    const upload = store.upload(buildTestWorld());
    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error("the generated public world must pass validation");

    expect(upload.preview.summary.name).toBe("Testwelt");
    const mapId = upload.preview.summary.maps[0];
    if (mapId === undefined) throw new Error("the generated public world must include a map");
    const map = store.file(upload.preview.token, `maps/${mapId}.json`);
    if (map === undefined) throw new Error("the generated public world must include its map");
    expect(JSON.parse(map.toString("utf8"))).toMatchObject({ orientation: "isometric" });
    expect(store.file(upload.preview.token, "../../etc/passwd")).toBeUndefined();
    expect(store.file(upload.preview.token, "not-in-the-package.txt")).toBeUndefined();
    expect(store.delete(upload.preview.token)).toBe(true);
    expect(store.file(upload.preview.token, `maps/${mapId}.json`)).toBeUndefined();
  });

  it("[MAP-06] refuses invalid archives without storing files", () => {
    const store = new PreviewPackageStore();
    const upload = store.upload(Buffer.from("not a gzip archive"));

    expect(upload.ok).toBe(false);
    if (upload.ok) throw new Error("an invalid package must be refused");
    expect(upload.findings[0]).toMatchObject({
      file: "(archive)",
      severity: "error",
    });
  });
});
