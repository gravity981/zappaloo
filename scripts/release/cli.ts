// node scripts/release/cli.ts candidate <version> [--github-output]
// node scripts/release/cli.ts promote <candidate tag> [--github-output]
// node scripts/release/cli.ts notes <tag> <owner/repo> [--ref <ref>] [--intro <text>]
// node scripts/release/cli.ts bundle <tag> <output directory> [--ref <ref>]
//
// Plans a release candidate or a promotion from the repository's git tags
// (sw-architecture.md 23.3) and prints the plan as JSON. With --github-output,
// also writes the plan's fields to $GITHUB_OUTPUT. Exits 1 if a rule is broken.
// `notes` prints the release notes (changelog from the commit messages since the
// previous release up to --ref, and the install and update commands); `bundle`
// packs the deployment bundle from --ref (both: OPS-19).
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createBundle } from "./bundle.ts";
import { buildChangelog, buildInstallNotes } from "./notes.ts";
import type { Commit } from "./notes.ts";
import { planCandidate, planPromotion, previousRelease, ReleaseError } from "./release.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "github-output": { type: "boolean", default: false },
    ref: { type: "string" },
    intro: { type: "string" },
  },
});
const [command, argument, argument2] = positionals;

const tags = execFileSync("git", ["tag", "--list"], { encoding: "utf8" })
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);

function output(fields: Record<string, string>): void {
  if (values["github-output"]) {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) throw new Error("--github-output: GITHUB_OUTPUT is not set");
    appendFileSync(
      file,
      Object.entries(fields)
        .map(([k, v]) => `${k}=${v}\n`)
        .join(""),
    );
  }
  console.log(JSON.stringify(fields));
}

/** Commits in (previousTag, ref], without merge commits (pull requests and direct commits count alike). */
function commitsBetween(previousTag: string | undefined, ref: string): Commit[] {
  const range = previousTag ? `${previousTag}..${ref}` : ref;
  return execFileSync("git", ["log", "--no-merges", "--format=%h%x1f%an%x1f%s", range], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha = "", author = "", subject = ""] = line.split("\x1f");
      return { sha, author, subject };
    });
}

try {
  if (command === "notes" && argument && argument2) {
    const latest = previousRelease(argument, tags);
    const previous = latest ? `v${latest}` : undefined;
    const changelog = buildChangelog({
      commits: commitsBetween(previous, values.ref ?? argument),
      tag: argument,
      previousTag: previous,
      repository: argument2,
    });
    const parts = [values.intro, changelog, buildInstallNotes(argument, argument2)];
    console.log(parts.filter(Boolean).join("\n\n"));
  } else if (command === "bundle" && argument && argument2) {
    console.log(createBundle(argument, values.ref ?? argument, argument2));
  } else if (command === "candidate" && argument) {
    const plan = planCandidate(argument, tags);
    output({
      version: plan.version,
      number: String(plan.number),
      tag: plan.tag,
      image_tag: plan.imageTag,
      previous_tag: plan.previousRelease ? `v${plan.previousRelease}` : "",
    });
  } else if (command === "promote" && argument) {
    const plan = planPromotion(argument, tags);
    output({
      version: plan.version,
      tag: plan.tag,
      candidate_tag: plan.candidate.tag,
      candidate_image_tag: plan.candidate.tag.slice(1),
      image_tags: plan.imageTags.join(" "),
      previous_tag: plan.previousRelease ? `v${plan.previousRelease}` : "",
    });
  } else {
    console.error(
      "Usage: release/cli.ts candidate <version> | promote <candidate tag> | notes <tag> <owner/repo> | bundle <tag> <dir>",
    );
    process.exitCode = 2;
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) throw error;
  console.error(`Release refused: ${error.message}`);
  process.exitCode = 1;
}
