// Release rules (sw-architecture.md 23.3, OPS-10, OPS-11, OPS-12). Pure functions
// over the list of git tags; the CLI (cli.ts) reads the tags and writes outputs.
import { compareReleases, parseRelease } from "../../shared/src/version.ts";
import type { Semver } from "../../shared/src/version.ts";

const CANDIDATE_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-rc\.([1-9]\d*)$/;
const RELEASE_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

export class ReleaseError extends Error {
  override name = "ReleaseError";
}

export interface Candidate {
  version: string;
  number: number;
  tag: string;
}

export function parseCandidateTag(tag: string): Candidate | undefined {
  const match = CANDIDATE_TAG.exec(tag);
  if (!match?.[1] || !match[2]) return undefined;
  return { version: match[1], number: Number(match[2]), tag };
}

/** Released versions (tags vX.Y.Z), highest first. */
export function releases(tags: string[]): string[] {
  return tags
    .map((tag) => RELEASE_TAG.exec(tag)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort((a, b) => compareReleases(semver(b), semver(a)));
}

function semver(version: string): Semver {
  const parsed = parseRelease(version);
  if (!parsed) throw new ReleaseError(`"${version}" is not a release version X.Y.Z`);
  return parsed;
}

function candidatesOf(tags: string[], version: string): Candidate[] {
  return tags
    .map(parseCandidateTag)
    .filter((c): c is Candidate => c?.version === version)
    .sort((a, b) => a.number - b.number);
}

export interface CandidatePlan {
  version: string;
  number: number;
  /** Git tag v<version>-rc.<M> */
  tag: string;
  /** Image tag <version>-rc.<M> */
  imageTag: string;
  /** The latest release, for the release notes (undefined before the first release). */
  previousRelease: string | undefined;
}

/**
 * Plans the next release candidate of `version` (OPS-10): `version` must be a
 * valid release version, higher than the latest release, and not released yet.
 * The candidate number is one more than the highest existing candidate.
 */
export function planCandidate(version: string, tags: string[]): CandidatePlan {
  const wanted = semver(version);
  const [latest] = releases(tags);
  if (tags.includes(`v${version}`)) {
    throw new ReleaseError(`v${version} is already released; choose a higher version`);
  }
  if (latest && compareReleases(wanted, semver(latest)) <= 0) {
    throw new ReleaseError(`${version} is not higher than the latest release ${latest}`);
  }
  const existing = candidatesOf(tags, version);
  const number = (existing.at(-1)?.number ?? 0) + 1;
  const tag = `v${version}-rc.${number}`;
  return { version, number, tag, imageTag: tag.slice(1), previousRelease: latest };
}

export interface PromotionPlan {
  version: string;
  candidate: Candidate;
  /** Git tag v<version> */
  tag: string;
  /** Image tags added to the candidate's image: <version>, <major>.<minor>, <major> */
  imageTags: string[];
  previousRelease: string | undefined;
}

/**
 * Plans the promotion of a candidate to a release (OPS-11): the candidate tag
 * exists, the version is not released yet, and no newer candidate exists.
 */
export function planPromotion(candidateTag: string, tags: string[]): PromotionPlan {
  const candidate = parseCandidateTag(candidateTag);
  if (!candidate) {
    throw new ReleaseError(`"${candidateTag}" is not a candidate tag like v1.2.0-rc.1`);
  }
  if (!tags.includes(candidateTag)) throw new ReleaseError(`${candidateTag} does not exist`);
  if (tags.includes(`v${candidate.version}`)) {
    throw new ReleaseError(`v${candidate.version} is already released`);
  }
  const newest = candidatesOf(tags, candidate.version).at(-1);
  if (newest && newest.number > candidate.number) {
    throw new ReleaseError(
      `only the latest candidate can be promoted: ${newest.tag} is newer than ${candidateTag}`,
    );
  }
  const { major, minor } = semver(candidate.version);
  return {
    version: candidate.version,
    candidate,
    tag: `v${candidate.version}`,
    imageTags: [candidate.version, `${major}.${minor}`, String(major)],
    previousRelease: releases(tags)[0],
  };
}
