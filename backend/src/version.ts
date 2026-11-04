// Version and commit of the running application (sw-architecture.md 23.1, 23.6).
import { execFileSync } from "node:child_process";
import { devVersion, lastRelease } from "@zappaloo/shared";
import type { VersionResponse } from "@zappaloo/shared";

export interface VersionSource {
  APP_VERSION?: string | undefined;
  APP_VERSION_SUFFIX?: string | undefined;
  APP_COMMIT?: string | undefined;
}

type Git = (args: string[]) => string | undefined;

const runGit: Git = (args) => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

/**
 * In an image, APP_VERSION is set once at build time; the deployment can only
 * add a pre-release suffix (`rc.N`). Running from source, the version is
 * `<last release>+dev`, with the last release taken from the git tags.
 */
export function resolveVersion(source: VersionSource, git: Git = runGit): VersionResponse {
  if (source.APP_VERSION) {
    const suffix = source.APP_VERSION_SUFFIX ? `-${source.APP_VERSION_SUFFIX}` : "";
    return { version: `${source.APP_VERSION}${suffix}`, commit: source.APP_COMMIT ?? "unknown" };
  }
  const release = lastRelease(
    git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "--exclude", "*-*"]),
  );
  return { version: devVersion(release), commit: git(["rev-parse", "HEAD"]) ?? "unknown" };
}
