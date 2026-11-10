// The deployment bundle of a release (sw-architecture.md 23.5, OPS-19): the
// server files from infrastructure/deploy/ as zappaloo-<tag>-deploy.tar.gz,
// read from a git ref so a promotion packs exactly the candidate's files.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleName } from "./notes.ts";

export const BUNDLE_FILES = ["compose.yaml", "deploy.sh", ".env.example"] as const;

/**
 * Packs the bundle of `tag` from git `ref` (in the repository at `cwd`) into
 * `outDir`; returns the archive path.
 */
export function createBundle(tag: string, ref: string, outDir: string, cwd?: string): string {
  const name = bundleName(tag);
  const staging = mkdtempSync(join(tmpdir(), "zappaloo-bundle-"));
  try {
    const folder = join(staging, name);
    mkdirSync(folder);
    for (const file of BUNDLE_FILES) {
      const content = execFileSync("git", ["show", `${ref}:infrastructure/deploy/${file}`], {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
      });
      const path = join(folder, file);
      writeFileSync(path, content);
      // Fixed permissions, whatever the checkout has.
      chmodSync(path, file === "deploy.sh" ? 0o755 : 0o644);
    }
    chmodSync(folder, 0o755);
    mkdirSync(outDir, { recursive: true });
    const archive = join(outDir, `${name}.tar.gz`);
    execFileSync("tar", ["-czf", archive, "-C", staging, name]);
    return archive;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
