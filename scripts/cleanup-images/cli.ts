// node scripts/cleanup-images/cli.ts [--dry-run]
//
// Deletes old build images from the GitHub Container Registry (OPS-14).
// Environment: GITHUB_TOKEN (packages: write, with admin access to the package),
// IMAGE_OWNER (user that owns the package), IMAGE_NAME (package name).
import { parseArgs } from "node:util";
import type { PackageVersion } from "./select.ts";
import { selectForDeletion, tagsOf } from "./select.ts";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const token = process.env.GITHUB_TOKEN;
const owner = process.env.IMAGE_OWNER;
const name = process.env.IMAGE_NAME;
if (!token || !owner || !name) {
  console.error("GITHUB_TOKEN, IMAGE_OWNER and IMAGE_NAME must be set");
  process.exit(1);
}

const base = `https://api.github.com/users/${owner}/packages/container/${encodeURIComponent(name)}/versions`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function listVersions(): Promise<PackageVersion[]> {
  const all: PackageVersion[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`${base}?per_page=100&page=${page}`, { headers });
    if (!response.ok)
      throw new Error(`listing versions: HTTP ${response.status} ${await response.text()}`);
    const batch = (await response.json()) as PackageVersion[];
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

const versions = await listVersions();
const doomed = selectForDeletion(versions, new Date());
console.log(
  `${versions.length} image version(s), ${doomed.length} to delete${values["dry-run"] ? " (dry run)" : ""}.`,
);

for (const version of doomed) {
  const label = `${tagsOf(version).join(", ")} (created ${version.created_at})`;
  if (values["dry-run"]) {
    console.log(`would delete ${label}`);
    continue;
  }
  const response = await fetch(`${base}/${version.id}`, { method: "DELETE", headers });
  if (!response.ok)
    throw new Error(`deleting ${label}: HTTP ${response.status} ${await response.text()}`);
  console.log(`deleted ${label}`);
}
