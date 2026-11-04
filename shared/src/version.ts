// Version scheme (sw-architecture.md 23.1, OPS-08), shared by backend, frontend
// build and tooling scripts. Pure functions: git is called by the callers.

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Parses a release version "X.Y.Z" (no pre-release, no build metadata). */
export function parseRelease(version: string): Semver | undefined {
  const match = SEMVER.exec(version);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareReleases(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * The last release from the output of
 * `git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*'`,
 * or 0.0.0 when there is no release tag yet.
 */
export function lastRelease(describeOutput: string | undefined): string {
  const version = describeOutput?.trim().replace(/^v/, "") ?? "";
  return parseRelease(version) ? version : "0.0.0";
}

/** Build of a pull request or of `main` in ci.yml: `<last release>+build.<N>`. */
export function ciVersion(release: string, runNumber: number): string {
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new Error(`invalid run number: ${runNumber}`);
  }
  return `${release}+build.${runNumber}`;
}

/** Local image build: `<last release>+local.<short commit>`. */
export function localVersion(release: string, shortCommit: string): string {
  return `${release}+local.${shortCommit}`;
}

/** Running from source: `<last release>+dev`. */
export function devVersion(release: string): string {
  return `${release}+dev`;
}

/** Docker tags cannot contain "+": version 1.1.0+build.57 has image tag 1.1.0_build.57. */
export function imageTag(version: string): string {
  return version.replace("+", "_");
}

/** True for image tags that only identify a CI build of main (X.Y.Z_build.N). */
export function isBuildTag(tag: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)_build\.[1-9]\d*$/.test(tag);
}
