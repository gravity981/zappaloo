// Release notes (sw-architecture.md 23.3, OPS-19): a changelog built from the
// commit messages since the previous release, and the commands to install or
// update an environment with the deployment bundle of the release.

export interface Commit {
  /** Abbreviated commit hash. */
  sha: string;
  author: string;
  /** First line of the commit message. */
  subject: string;
}

/** Sections of the changelog, in the order they are listed. */
export type Section = "Added" | "Fixed" | "Changed" | "Dependencies";

const HOUSEKEEPING = /^(chore|test|tests|ci|docs|build)(\([^)]*\))?:\s/i;
const STEP_WITH_TEXT = /^step\s+[\w.]+\s+-\s+(.+)$/i;
const BARE_STEP = /^step\s+[\w.]+$/i;
const ADDED = /^(feat|feature|add|added)(\([^)]*\))?(:\s|\s)/i;
const FIXED = /^(fix|fixed|bugfix)(\([^)]*\))?(:\s|\s)/i;
const PREFIX = /^(feat|feature|fix|bugfix)(\([^)]*\))?:\s+(.*)$/i;

export interface ClassifiedCommit {
  section: Section;
  text: string;
}

/**
 * Sorts a commit by the start of its message; `undefined` means it is left out
 * of the notes:
 * - `chore:`, `docs:`, `test:`, `ci:`, `build:` and a bare "step 1d" are housekeeping;
 * - bots and "Bump …" are Dependencies;
 * - `feat:` / "Add …" is Added, `fix:` / "Fix …" is Fixed, the rest is Changed.
 * An optional "step 1f - " prefix and a `feat(scope): ` prefix are dropped.
 */
export function classifyCommit(commit: Commit): ClassifiedCommit | undefined {
  let subject = commit.subject.trim();
  if (BARE_STEP.test(subject)) return undefined;
  subject = STEP_WITH_TEXT.exec(subject)?.[1]?.trim() ?? subject;
  if (HOUSEKEEPING.test(subject)) return undefined;
  if (commit.author.endsWith("[bot]") || /^bump\s/i.test(subject)) {
    return { section: "Dependencies", text: subject };
  }
  const stripped = PREFIX.exec(subject)?.[3] ?? subject;
  const text = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  if (ADDED.test(subject)) return { section: "Added", text };
  if (FIXED.test(subject)) return { section: "Fixed", text };
  return { section: "Changed", text: subject };
}

/**
 * The "What's changed" section. `previousTag` is the previous release (none
 * before the first release: then every commit is listed and there is no
 * comparison link). Merge commits must not be in `commits`.
 */
export function buildChangelog(options: {
  commits: Commit[];
  tag: string;
  previousTag: string | undefined;
  repository: string;
}): string {
  const { commits, tag, previousTag, repository } = options;
  const sections: Record<Section, string[]> = {
    Added: [],
    Fixed: [],
    Changed: [],
    Dependencies: [],
  };
  for (const commit of commits) {
    const entry = classifyCommit(commit);
    if (entry) sections[entry.section].push(`- ${entry.text} (\`${commit.sha}\`)`);
  }
  const lines = [`## What's changed${previousTag ? ` since ${previousTag}` : ""}`];
  let listed = 0;
  for (const name of ["Added", "Fixed", "Changed", "Dependencies"] as const) {
    if (sections[name].length === 0) continue;
    listed += sections[name].length;
    lines.push("", `### ${name}`, "", ...sections[name]);
  }
  if (listed === 0) lines.push("", "No user-facing changes.");
  if (previousTag) {
    lines.push(
      "",
      `**Full changelog:** https://github.com/${repository}/compare/${previousTag}...${tag}`,
    );
  }
  return lines.join("\n");
}

/** Name of the deployment bundle (archive and the folder in it) of a tag. */
export function bundleName(tag: string): string {
  return `zappaloo-${tag}-deploy`;
}

const RELEASE = /^v\d+\.\d+\.\d+$/;
const CANDIDATE = /^v\d+\.\d+\.\d+-rc\.\d+$/;

/**
 * Commands to install and to update an environment from the bundle of `tag`:
 * prod for a release, staging for a release candidate. The bundle holds only
 * compose.yaml, deploy.sh and .env.example, so an update keeps .env, secrets
 * and backups (sw-architecture.md 23.5).
 */
export function buildInstallNotes(tag: string, repository: string): string {
  let environment: "prod" | "staging";
  if (RELEASE.test(tag)) environment = "prod";
  else if (CANDIDATE.test(tag)) environment = "staging";
  else throw new Error(`${tag} is neither a release vX.Y.Z nor a candidate vX.Y.Z-rc.N`);

  const url = `https://github.com/${repository}/releases/download/${tag}/${bundleName(tag)}.tar.gz`;
  const directory = `~/zappaloo-${environment}`;
  const hint =
    environment === "prod"
      ? "set APP_ENV=prod, COMPOSE_PROJECT_NAME=zappaloo, DATA_VOLUME=zappaloo-data-prod, SITE_ADDRESS, TLS_MODE, HTTP_PORT=80, HTTPS_PORT=443, COMPOSE_PROFILES=, SMTP_*"
      : "SITE_ADDRESS is the LAN IP; the defaults fit staging";
  const restore =
    environment === "staging"
      ? "\n# Staging starts from the newest full backup of prod: copy it to backups/*.tar.gz first"
      : "";
  const deploy = `./deploy.sh ${environment} ${tag.slice(1)}`;
  // Every staging deployment replaces the data with the newest backup (23.5).
  const updateDeploy =
    environment === "staging" ? `${deploy}    # --no-restore keeps the current data` : deploy;
  return [
    `**First installation** of ${environment}, on a server with Docker and Docker Compose:`,
    "",
    "```bash",
    `mkdir -p ${directory} && cd ${directory}`,
    `curl -fsSL "${url}" | tar -xz --strip-components=1`,
    `cp .env.example .env    # ${hint}${restore}`,
    deploy,
    "```",
    "",
    `**Update** of an existing ${environment} (keeps its .env, secrets and backups):`,
    "",
    "```bash",
    `cd ${directory}`,
    `curl -fsSL "${url}" | tar -xz --strip-components=1`,
    updateDeploy,
    "```",
    "",
    "Details: [infrastructure/deploy/README.md](https://github.com/" +
      `${repository}/blob/${tag}/infrastructure/deploy/README.md).`,
  ].join("\n");
}
