// node scripts/version/cli.ts ci --run-number <N> [--github-output]
// node scripts/version/cli.ts local
//
// Prints the version and image tag of a build (sw-architecture.md 23.1). With
// --github-output, also writes `version`, `image_tag` and `commit` to
// $GITHUB_OUTPUT for later workflow steps.
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gitCommit, gitLastRelease, gitShortCommit } from "./git.ts";
import { ciVersion, imageTag, localVersion } from "../../shared/src/version.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "run-number": { type: "string" },
    "github-output": { type: "boolean", default: false },
  },
});

const kind = positionals[0];
const release = gitLastRelease();
let version: string;
if (kind === "ci") {
  version = ciVersion(release, Number(values["run-number"]));
} else if (kind === "local") {
  version = localVersion(release, gitShortCommit());
} else {
  console.error("Usage: version/cli.ts ci --run-number <N> [--github-output] | local");
  process.exit(1);
}

const output = { version, image_tag: imageTag(version), commit: gitCommit() };
if (values["github-output"]) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) throw new Error("--github-output: GITHUB_OUTPUT is not set");
  appendFileSync(
    file,
    Object.entries(output)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(""),
  );
}
console.log(JSON.stringify(output));
