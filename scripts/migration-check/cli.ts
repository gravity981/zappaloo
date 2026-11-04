// npm run migration-check
//
// 1. The Drizzle schema has no changes without a migration (drizzle-kit generate
//    would create none).
// 2. All migrations apply to an empty database.
// 3. If a release exists: its migrations are unchanged, and the current
//    migrations apply to a database at the release's schema.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitLastRelease } from "../version/git.ts";
import { applyMigrations, compareReleasedMigrations, readMigrationFiles } from "./check.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const backendDir = join(root, "backend");
const migrationsDir = join(backendDir, "drizzle");
const errors: string[] = [];

/** All files below a directory: relative path → content. */
function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(dir.length + 1), readFileSync(path, "utf8"));
  }
  return files;
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

// 1. Schema drift. drizzle-kit writes a new migration if the schema changed; the
// folder is restored to exactly its previous content afterwards, so uncommitted
// migrations of the developer are left alone.
const snapshot = readTree(migrationsDir);
execFileSync("npx", ["drizzle-kit", "generate", "--name", "migration-check"], {
  cwd: backendDir,
  stdio: ["ignore", "ignore", "inherit"],
});
const after = readTree(migrationsDir);
const drifted = [...after].some(([file, content]) => snapshot.get(file) !== content);
if (drifted) {
  errors.push(
    `backend/src/database/schema.ts has changes without a migration; run "npm run db:generate -w backend" and commit the result`,
  );
  for (const [file, content] of after) {
    const original = snapshot.get(file);
    if (original === undefined) rmSync(join(migrationsDir, file));
    else if (original !== content) writeFileSync(join(migrationsDir, file), original);
  }
}

// 2. Empty database
try {
  const applied = applyMigrations(migrationsDir);
  console.log(`Empty database: ${applied} migration(s) applied.`);
} catch (error) {
  errors.push(`migrations fail on an empty database: ${String(error)}`);
}

// 3. Latest release
const release = gitLastRelease(root);
const tag = `v${release}`;
const tagExists = release !== "0.0.0" || git(["tag", "--list", tag]).trim() !== "";
if (!tagExists) {
  console.log("No release yet: the comparison with the latest release is skipped.");
} else {
  const releasedDir = mkdtempSync(join(tmpdir(), "zappaloo-released-"));
  try {
    const files = git(["ls-tree", "-r", "--name-only", tag, "backend/drizzle"]).split("\n");
    for (const file of files.filter(Boolean)) {
      const target = join(releasedDir, file.slice("backend/drizzle/".length));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, git(["show", `${tag}:${file}`]));
    }
    errors.push(
      ...compareReleasedMigrations(
        readMigrationFiles(releasedDir),
        readMigrationFiles(migrationsDir),
      ).map((e) => `${e} after ${tag}`),
    );
    const applied = applyMigrations(migrationsDir, releasedDir);
    console.log(`Database of ${tag}: ${applied} new migration(s) applied.`);
  } catch (error) {
    errors.push(`migrations fail on a database of ${tag}: ${String(error)}`);
  } finally {
    rmSync(releasedDir, { recursive: true, force: true });
  }
}

if (errors.length > 0) {
  console.error(`Migration check FAILED:\n  - ${errors.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log("Migration check OK.");
}
