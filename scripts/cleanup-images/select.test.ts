import { describe, expect, it } from "vitest";
import type { PackageVersion } from "./select.ts";
import { selectForDeletion } from "./select.ts";

const NOW = new Date("2026-12-31T12:00:00Z");

function version(id: number, daysOld: number, tags: string[]): PackageVersion {
  const created = new Date(NOW.getTime() - daysOld * 24 * 60 * 60 * 1000);
  return { id, created_at: created.toISOString(), metadata: { container: { tags } } };
}

describe("image cleanup", () => {
  it("[OPS-14] deletes images that only carry build tags and are older than 30 days", () => {
    const versions = [
      version(1, 31, ["1.1.0_build.57"]),
      version(2, 45, ["1.1.0_build.12", "1.1.0_build.13"]),
      version(3, 29, ["1.1.0_build.80"]),
    ];
    expect(selectForDeletion(versions, NOW).map((v) => v.id)).toEqual([1, 2]);
  });

  it("[OPS-14] keeps release candidates, releases and the current main image, whatever their age", () => {
    const versions = [
      version(1, 400, ["1.2.0-rc.1"]),
      version(2, 400, ["1.2.0", "1.2", "1"]),
      version(3, 400, ["1.1.0_build.90", "main"]),
      version(4, 400, ["1.1.0_build.91", "1.2.0-rc.2"]),
      version(5, 400, ["local"]),
    ];
    expect(selectForDeletion(versions, NOW)).toEqual([]);
  });

  it("[OPS-14] never deletes untagged versions", () => {
    const untagged: PackageVersion = { id: 9, created_at: "2020-01-01T00:00:00Z" };
    expect(selectForDeletion([untagged, version(8, 400, [])], NOW)).toEqual([]);
  });
});
