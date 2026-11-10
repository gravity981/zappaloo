// node scripts/release/cli.ts candidate <version> [--github-output]
// node scripts/release/cli.ts promote <candidate tag> [--github-output]
//
// Plans a release candidate or a promotion from the repository's git tags
// (sw-architecture.md 23.3) and prints the plan as JSON. With --github-output,
// also writes the plan's fields to $GITHUB_OUTPUT. Exits 1 if a rule is broken.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { planCandidate, planPromotion, ReleaseError } from "./release.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "github-output": { type: "boolean", default: false } },
});
const [command, argument] = positionals;

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

try {
  if (command === "candidate" && argument) {
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
    console.error("Usage: release/cli.ts candidate <version> | promote <candidate tag>");
    process.exitCode = 2;
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) throw error;
  console.error(`Release refused: ${error.message}`);
  process.exitCode = 1;
}
