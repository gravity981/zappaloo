import { describe, expect, it } from "vitest";
import { parseCandidateTag, planCandidate, planPromotion, releases } from "./release.ts";

const TAGS = ["v1.0.0", "v1.1.0-rc.1", "v1.1.0", "v1.2.0-rc.1", "v1.2.0-rc.2", "v0.9.0"];

describe("release candidates", () => {
  it("[OPS-10] numbers candidates of a version from 1, one more than the highest existing", () => {
    expect(planCandidate("1.3.0", TAGS)).toEqual({
      version: "1.3.0",
      number: 1,
      tag: "v1.3.0-rc.1",
      imageTag: "1.3.0-rc.1",
      previousRelease: "1.1.0",
    });
    expect(planCandidate("1.2.0", TAGS).tag).toBe("v1.2.0-rc.3");
    // Gaps don't matter: the highest number counts.
    expect(planCandidate("2.0.0", ["v2.0.0-rc.1", "v2.0.0-rc.4"]).number).toBe(5);
  });

  it("[OPS-10] the first candidate ever has no previous release", () => {
    expect(planCandidate("0.1.0", [])).toMatchObject({
      tag: "v0.1.0-rc.1",
      previousRelease: undefined,
    });
  });

  it("[OPS-10][OPS-12] refuses invalid versions, versions not above the latest release, and released versions", () => {
    expect(() => planCandidate("1.3", TAGS)).toThrow(/not a release version/);
    expect(() => planCandidate("v1.3.0", TAGS)).toThrow(/not a release version/);
    expect(() => planCandidate("1.3.0-rc.1", TAGS)).toThrow(/not a release version/);
    expect(() => planCandidate("1.0.5", TAGS)).toThrow(/not higher than the latest release 1.1.0/);
    expect(() => planCandidate("1.1.0", TAGS)).toThrow(/already released/);
  });
});

describe("promotion", () => {
  it("[OPS-11] promotes the latest candidate: release tag and image tags <version>, <major>.<minor>, <major>", () => {
    expect(planPromotion("v1.2.0-rc.2", TAGS)).toEqual({
      version: "1.2.0",
      candidate: { version: "1.2.0", number: 2, tag: "v1.2.0-rc.2" },
      tag: "v1.2.0",
      imageTags: ["1.2.0", "1.2", "1"],
      previousRelease: "1.1.0",
    });
    expect(planPromotion("v0.1.0-rc.1", ["v0.1.0-rc.1"]).imageTags).toEqual(["0.1.0", "0.1", "0"]);
  });

  it("[OPS-11] only the latest candidate can be promoted", () => {
    expect(() => planPromotion("v1.2.0-rc.1", TAGS)).toThrow(
      /v1.2.0-rc.2 is newer than v1.2.0-rc.1/,
    );
  });

  it("[OPS-11][OPS-12] refuses unknown candidates, non-candidate tags and versions already released", () => {
    expect(() => planPromotion("v1.2.0-rc.9", TAGS)).toThrow(/does not exist/);
    expect(() => planPromotion("v1.2.0", TAGS)).toThrow(/not a candidate tag/);
    expect(() => planPromotion("v1.1.0-rc.1", TAGS)).toThrow(/already released/);
  });
});

describe("tags", () => {
  it("parses candidate tags and orders releases numerically", () => {
    expect(parseCandidateTag("v1.2.0-rc.12")).toEqual({
      version: "1.2.0",
      number: 12,
      tag: "v1.2.0-rc.12",
    });
    expect(parseCandidateTag("v1.2.0-rc.0")).toBeUndefined();
    expect(parseCandidateTag("1.2.0-rc.1")).toBeUndefined();
    expect(releases(["v1.9.0", "v1.10.0", "v1.10.0-rc.1", "main"])).toEqual(["1.10.0", "1.9.0"]);
  });
});
