// Which container image versions to delete (OPS-14, sw-architecture.md 23.2):
// images whose only tags are build tags (X.Y.Z_build.N) and that are older than
// 30 days. Release candidates, releases, `main` and untagged versions are kept.
// (Untagged versions are kept because they may be parts of a multi-platform
// image; the images are built without separate attestation manifests.)
import { isBuildTag } from "../../shared/src/version.ts";

export interface PackageVersion {
  id: number;
  created_at: string;
  metadata?: { container?: { tags?: string[] } };
}

export const MAX_AGE_DAYS = 30;

export function tagsOf(version: PackageVersion): string[] {
  return version.metadata?.container?.tags ?? [];
}

export function selectForDeletion(
  versions: PackageVersion[],
  now: Date,
  maxAgeDays = MAX_AGE_DAYS,
): PackageVersion[] {
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return versions.filter((version) => {
    const tags = tagsOf(version);
    return (
      tags.length > 0 && tags.every(isBuildTag) && new Date(version.created_at).getTime() < cutoff
    );
  });
}
