import { describe, expect, it } from "vitest";
import {
  ciVersion,
  compareReleases,
  devVersion,
  imageTag,
  isBuildTag,
  lastRelease,
  localVersion,
  parseRelease,
} from "./version.ts";

describe("version scheme", () => {
  it("[OPS-08] the last release comes from the latest vX.Y.Z tag, or is 0.0.0", () => {
    expect(lastRelease("v1.2.0")).toBe("1.2.0");
    expect(lastRelease("v1.2.0\n")).toBe("1.2.0");
    expect(lastRelease(undefined)).toBe("0.0.0");
    expect(lastRelease("")).toBe("0.0.0");
    // git describe excludes candidates already; anything else is not a release
    expect(lastRelease("v1.2.0-rc.1")).toBe("0.0.0");
    expect(lastRelease("release-3")).toBe("0.0.0");
  });

  it("[OPS-08] CI builds are <last release>+build.<run number>", () => {
    expect(ciVersion("1.1.0", 57)).toBe("1.1.0+build.57");
    expect(ciVersion("0.0.0", 1)).toBe("0.0.0+build.1");
    expect(() => ciVersion("1.1.0", Number.NaN)).toThrow(/run number/);
    expect(() => ciVersion("1.1.0", 0)).toThrow(/run number/);
  });

  it("[OPS-08] local builds are <last release>+local.<short commit>, source runs <last release>+dev", () => {
    expect(localVersion("1.1.0", "abc1234")).toBe("1.1.0+local.abc1234");
    expect(devVersion("1.1.0")).toBe("1.1.0+dev");
  });

  it("[OPS-08] image tags replace + with _, since Docker tags cannot contain +", () => {
    expect(imageTag("1.1.0+build.57")).toBe("1.1.0_build.57");
    expect(imageTag("1.2.0")).toBe("1.2.0");
    expect(imageTag("1.2.0-rc.2")).toBe("1.2.0-rc.2");
  });

  it("[OPS-08] recognises build tags, but not release, candidate or other tags", () => {
    expect(isBuildTag("1.1.0_build.57")).toBe(true);
    for (const tag of ["1.1.0", "1.1.0-rc.1", "main", "local", "1.1_build.5", "1.1.0_build.0"]) {
      expect(isBuildTag(tag), tag).toBe(false);
    }
  });

  it("parses and orders release versions", () => {
    expect(parseRelease("1.10.0")).toEqual({ major: 1, minor: 10, patch: 0 });
    expect(parseRelease("01.0.0")).toBeUndefined();
    expect(parseRelease("1.0.0-rc.1")).toBeUndefined();
    const v = (s: string) => parseRelease(s) ?? { major: 0, minor: 0, patch: 0 };
    expect(compareReleases(v("1.10.0"), v("1.9.9"))).toBeGreaterThan(0);
    expect(compareReleases(v("1.2.3"), v("1.2.3"))).toBe(0);
  });
});
