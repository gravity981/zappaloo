import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type RelevantMap, selectE2e, specFiles } from "./select-e2e.ts";

const map = JSON.parse(readFileSync("e2e/relevant.json", "utf8")) as RelevantMap;

describe("which end-to-end specs a pull request runs", () => {
  it("a change in an area runs the specs of that area", () => {
    expect(selectE2e(["game-engine/src/GameScene.ts"], map)).toMatchObject({ mode: "some" });
    expect(selectE2e(["game-engine/src/GameScene.ts"], map).specs).toContain(
      "e2e/game-world.spec.ts",
    );
    expect(selectE2e(["backend/src/rsvp/service.ts"], map).specs).toContain("e2e/rsvp.spec.ts");
  });

  it("the specs of several areas are joined, without doubles", () => {
    const { specs } = selectE2e(["backend/src/rsvp/service.ts", "backend/src/waiting/x.ts"], map);
    expect(specs.filter((spec) => spec === "e2e/waiting.spec.ts")).toHaveLength(1);
  });

  it("shared code, configuration and dependencies run every spec", () => {
    expect(selectE2e(["shared/src/world.ts"], map).mode).toBe("all");
    expect(selectE2e(["package-lock.json"], map).mode).toBe("all");
    expect(selectE2e(["game-engine/src/a.ts", "playwright.config.ts"], map).mode).toBe("all");
    expect(selectE2e([".github/workflows/ci.yml"], map).mode).toBe("all");
  });

  it("code that no area knows runs every spec, to be safe", () => {
    expect(selectE2e(["backend/src/somewhere-new/thing.ts"], map).mode).toBe("all");
  });

  it("documents, unit tests, scripts and the other workflows run none", () => {
    expect(
      selectE2e(
        [
          "spec/sw-architecture.md",
          "CLAUDE.md",
          "game-engine/src/random.test.ts",
          "scripts/ci/select-e2e.ts",
          ".github/workflows/nightly.yml",
        ],
        map,
      ),
    ).toEqual({ mode: "none", specs: [] });
  });

  it("a changed spec runs itself", () => {
    expect(selectE2e(["e2e/privacy.spec.ts"], map)).toEqual({
      mode: "some",
      specs: ["e2e/privacy.spec.ts"],
    });
  });
});

describe("the map of relevant specs (e2e/relevant.json)", () => {
  const specs = specFiles();
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  }).split("\n");

  it("every spec file is in an area, so that a change can select it", () => {
    const mapped = new Set(map.areas.flatMap((area) => area.specs));
    expect(specs.filter((spec) => !mapped.has(spec))).toEqual([]);
  });

  it("every spec of the map exists", () => {
    const unknown = map.areas.flatMap((area) => area.specs).filter((spec) => !specs.includes(spec));
    expect(unknown).toEqual([]);
  });

  it("every path of the map exists in the repository", () => {
    const paths = [...map.all, ...map.none, ...map.areas.flatMap((area) => area.paths)];
    expect(paths.filter((path) => !tracked.some((file) => file.startsWith(path)))).toEqual([]);
  });
});
