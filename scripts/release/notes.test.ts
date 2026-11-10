import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLE_FILES, createBundle } from "./bundle.ts";
import { buildChangelog, buildInstallNotes, bundleName, classifyCommit } from "./notes.ts";
import type { Commit } from "./notes.ts";
import { previousRelease } from "./release.ts";

const commit = (subject: string, author = "dev", sha = "abc1234"): Commit => ({
  sha,
  author,
  subject,
});

describe("changelog from commit messages", () => {
  it("[OPS-19] sorts commits by the start of the message: Added, Fixed, Changed, Dependencies", () => {
    const text = buildChangelog({
      commits: [
        commit("feat(rsvp): answer for a group"),
        commit("add backup restore functionality"),
        commit("fix: login redirect"),
        commit("Fixed typo in the footer"),
        commit("Rework the venue list"),
        commit("Bump vite from 7.0.0 to 7.1.0", "dependabot[bot]"),
      ],
      tag: "v0.2.0",
      previousTag: "v0.1.0",
      repository: "owner/zappaloo",
    });
    expect(text).toContain("## What's changed since v0.1.0");
    const order = ["### Added", "### Fixed", "### Changed", "### Dependencies"].map((h) =>
      text.indexOf(h),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("- Answer for a group (`abc1234`)");
    expect(text).toContain("- Add backup restore functionality (`abc1234`)");
    expect(text).toContain("- Login redirect (`abc1234`)");
    expect(text).toContain("- Fixed typo in the footer (`abc1234`)");
    expect(text).toContain("- Rework the venue list (`abc1234`)");
    expect(text).toContain("- Bump vite from 7.0.0 to 7.1.0 (`abc1234`)");
    expect(text).toContain(
      "**Full changelog:** https://github.com/owner/zappaloo/compare/v0.1.0...v0.2.0",
    );
  });

  it("[OPS-19] leaves out housekeeping commits and bare step commits, and drops the step prefix", () => {
    for (const subject of [
      "chore: update lockfile",
      "docs(spec): clarify OPS-05",
      "test: more cases",
      "ci: pin actions",
      "build: image size",
      "step 1d",
      "step 2b",
    ]) {
      expect(classifyCommit(commit(subject)), subject).toBeUndefined();
    }
    expect(classifyCommit(commit("step 1f - Backup and restore tools"))).toEqual({
      section: "Changed",
      text: "Backup and restore tools",
    });
    expect(classifyCommit(commit("step 3a - feat: RSVP form"))).toEqual({
      section: "Added",
      text: "RSVP form",
    });
  });

  it("[OPS-19] lists everything without a comparison link before the first release", () => {
    const text = buildChangelog({
      commits: [commit("Something")],
      tag: "v0.1.0-rc.1",
      previousTag: undefined,
      repository: "owner/zappaloo",
    });
    expect(text).toContain("## What's changed\n");
    expect(text).toContain("- Something (`abc1234`)");
    expect(text).not.toContain("compare");
  });

  it("[OPS-19] says so when there is nothing to list", () => {
    const text = buildChangelog({
      commits: [commit("chore: x")],
      tag: "v0.2.0",
      previousTag: "v0.1.0",
      repository: "owner/zappaloo",
    });
    expect(text).toContain("No user-facing changes.");
  });

  it("[OPS-19] compares with the highest release below the tag, never with the tag itself", () => {
    const tags = ["v1.0.0", "v1.1.0-rc.1", "v1.1.0", "v1.2.0-rc.1", "v0.9.0", "v1.10.0"];
    expect(previousRelease("v1.2.0-rc.2", tags)).toBe("1.1.0");
    expect(previousRelease("v1.1.0", tags)).toBe("1.0.0");
    expect(previousRelease("v0.1.0", tags)).toBeUndefined();
    expect(() => previousRelease("main", tags)).toThrow(/neither a release nor a candidate/);
  });
});

describe("install and update instructions", () => {
  it("[OPS-19] a release is installed and updated in prod with the commands of its bundle", () => {
    const notes = buildInstallNotes("v1.2.0", "owner/zappaloo");
    const url = `https://github.com/owner/zappaloo/releases/download/v1.2.0/${bundleName("v1.2.0")}.tar.gz`;
    const [install = "", update = ""] = notes.split("**Update**");
    for (const part of [install, update]) {
      expect(part).toContain(`curl -fsSL "${url}" | tar -xz --strip-components=1`);
      expect(part).toContain("./deploy.sh prod 1.2.0");
      expect(part).toContain("cd ~/zappaloo-prod");
    }
    expect(install).toContain("cp .env.example .env");
    // The first admin is created once, not with an update.
    expect(install).toContain("zappaloo create-admin <username> --vip");
    expect(update).not.toContain("create-admin");
    expect(update).not.toContain(".env.example"); // an update keeps the existing .env
    expect(notes).toContain("blob/v1.2.0/infrastructure/deploy/README.md");
  });

  it("[OPS-19] a candidate is installed and updated in staging, with its image tag", () => {
    const notes = buildInstallNotes("v1.2.0-rc.3", "owner/zappaloo");
    expect(notes).toContain("**First installation** of staging");
    expect(notes).toContain("./deploy.sh staging 1.2.0-rc.3");
    expect(notes).toContain("cd ~/zappaloo-staging");
    expect(notes).toContain("backups/*.tar.gz");
    expect(notes).not.toContain("create-admin"); // staging starts from prod's accounts
    expect(notes).toContain("--no-restore");
  });

  it("[OPS-19] refuses tags that are neither a release nor a candidate", () => {
    expect(() => buildInstallNotes("1.2.0", "owner/zappaloo")).toThrow(/neither a release/);
    expect(() => buildInstallNotes("main", "owner/zappaloo")).toThrow(/neither a release/);
  });
});

describe("deployment bundle and release notes from a repository", () => {
  const cleanups: string[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((dir) => {
      rmSync(dir, { recursive: true, force: true });
    });
  });

  /** A temporary git repository with the deployment files. */
  function repository(): string {
    const dir = mkdtempSync(join(tmpdir(), "zappaloo-release-"));
    cleanups.push(dir);
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=dev", "-c", "user.email=dev@example.com", ...args], {
        cwd: dir,
        stdio: "pipe",
      });
    git("init", "-q");
    mkdirSync(join(dir, "infrastructure/deploy"), { recursive: true });
    for (const file of BUNDLE_FILES) {
      writeFileSync(join(dir, "infrastructure/deploy", file), `${file} v1\n`);
    }
    git("add", ".");
    git("commit", "-qm", "Initial release");
    git("tag", "v1.0.0");
    writeFileSync(join(dir, "infrastructure/deploy/compose.yaml"), "compose.yaml v2\n");
    git("commit", "-qam", "feat: new venue map");
    git("commit", "-q", "--allow-empty", "-m", "fix: wrong date");
    git("commit", "-q", "--allow-empty", "-m", "chore: tidy");
    git("tag", "v1.1.0-rc.1");
    return dir;
  }

  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));

  it("[OPS-19] packs the bundle from the given commit with fixed permissions", () => {
    const dir = repository();
    const out = join(dir, "dist");
    const archive = createBundle("v1.0.0", "v1.0.0", out, dir);
    expect(archive).toBe(join(out, "zappaloo-v1.0.0-deploy.tar.gz"));
    const listing = execFileSync("tar", ["-tvzf", archive], { encoding: "utf8" });
    for (const file of BUNDLE_FILES) expect(listing).toContain(`zappaloo-v1.0.0-deploy/${file}`);
    expect(listing).toMatch(/-rwxr-xr-x .*deploy\.sh/);
    expect(listing).toMatch(/-rw-r--r-- .*compose\.yaml/);

    // Unpacked like the install command does: the files directly in the target folder.
    const target = join(dir, "env");
    mkdirSync(target);
    execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", target]);
    expect(readFileSync(join(target, "compose.yaml"), "utf8")).toBe("compose.yaml v1\n");
    expect(statSync(join(target, "deploy.sh")).mode & 0o777).toBe(0o755);

    // A later commit has the changed file.
    const later = createBundle("v1.1.0-rc.1", "v1.1.0-rc.1", join(dir, "dist2"), dir);
    execFileSync("tar", ["-xzf", later, "--strip-components=1", "-C", target]);
    expect(readFileSync(join(target, "compose.yaml"), "utf8")).toBe("compose.yaml v2\n");
  });

  it("[OPS-19] prints the release notes of a candidate: intro, changelog since the previous release, commands", () => {
    const dir = repository();
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "notes",
        "v1.1.0-rc.1",
        "owner/zappaloo",
        "--ref",
        "HEAD",
        "--intro",
        "Candidate of 1.1.0.",
      ],
      { cwd: dir, encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const notes = result.stdout;
    expect(notes.startsWith("Candidate of 1.1.0.\n\n## What's changed since v1.0.0")).toBe(true);
    expect(notes).toContain("- New venue map (");
    expect(notes).toContain("- Wrong date (");
    expect(notes).not.toContain("tidy");
    expect(notes).not.toContain("Initial release"); // before the previous release
    expect(notes).toContain("compare/v1.0.0...v1.1.0-rc.1");
    expect(notes).toContain("./deploy.sh staging 1.1.0-rc.1");
  });

  it("[OPS-19] the bundle command writes the archive and prints its path", () => {
    const dir = repository();
    const result = spawnSync(
      process.execPath,
      [cli, "bundle", "v1.1.0-rc.1", "dist", "--ref", "HEAD"],
      {
        cwd: dir,
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      join(dir, "dist", "zappaloo-v1.1.0-rc.1-deploy.tar.gz").replace(dir + "/", ""),
    );
  });
});
