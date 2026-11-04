// Version scheme (OPS-08) is completed in step 1c; these tests get their tag then.
import { describe, expect, it } from "vitest";
import { resolveVersion } from "./version.ts";

describe("resolveVersion", () => {
  const noGit = () => undefined;

  it("uses the version baked into the image, with the deployment's rc suffix", () => {
    expect(resolveVersion({ APP_VERSION: "1.2.0", APP_COMMIT: "abc" }, noGit)).toEqual({
      version: "1.2.0",
      commit: "abc",
    });
    expect(resolveVersion({ APP_VERSION: "1.2.0", APP_VERSION_SUFFIX: "rc.3" }, noGit)).toEqual({
      version: "1.2.0-rc.3",
      commit: "unknown",
    });
  });

  it("reports <last release>+dev when running from source", () => {
    const git = (args: string[]) => (args[0] === "describe" ? "v1.1.0" : "0123abc");
    expect(resolveVersion({}, git)).toEqual({ version: "1.1.0+dev", commit: "0123abc" });
  });

  it("falls back to 0.0.0+dev without releases or without git", () => {
    expect(resolveVersion({}, noGit)).toEqual({ version: "0.0.0+dev", commit: "unknown" });
  });
});
