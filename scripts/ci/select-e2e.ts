// node scripts/ci/select-e2e.ts <base commit> [--github-output]
//
// Which end-to-end specs a pull request runs (spec/test-strategy.md 8.3): the specs that e2e/relevant.json maps the
// changed files to, or all of them. Prints the choice and, with --github-output, writes `mode` (all, some or none),
// `specs` (the selected spec files) and `rest` (the other spec files) to $GITHUB_OUTPUT for the workflow.
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export interface RelevantMap {
  all: string[];
  none: string[];
  areas: { name: string; paths: string[]; specs: string[] }[];
}

export interface Selection {
  mode: "all" | "some" | "none";
  specs: string[];
}

const SPEC = /^e2e\/[^/]+\.spec\.ts$/;
const UNIT_TEST = /\.test\.tsx?$/;
const DOCUMENT_SUFFIX = ".md";
const CODE = /\.(ts|tsx|js|mjs|json|css|html|svg|png)$/;

/** The specs a set of changed files needs: every spec, some of them, or none. */
export function selectE2e(changed: readonly string[], map: RelevantMap): Selection {
  const specs = new Set<string>();
  for (const file of changed) {
    if (map.all.some((prefix) => file.startsWith(prefix))) return { mode: "all", specs: [] };
    // A changed spec runs itself.
    if (SPEC.test(file)) {
      specs.add(file);
      continue;
    }
    if (UNIT_TEST.test(file) || file.endsWith(DOCUMENT_SUFFIX)) continue;
    if (map.none.some((prefix) => file.startsWith(prefix))) continue;
    const areas = map.areas.filter((area) => area.paths.some((prefix) => file.startsWith(prefix)));
    if (areas.length > 0) {
      for (const area of areas) for (const spec of area.specs) specs.add(spec);
      continue;
    }
    // Code that no area knows: it could affect anything.
    if (CODE.test(file)) return { mode: "all", specs: [] };
  }
  return specs.size === 0
    ? { mode: "none", specs: [] }
    : { mode: "some", specs: [...specs].sort() };
}

/** The spec files of the repository. */
export function specFiles(directory = "e2e"): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => `${directory}/${name}`)
    .sort();
}

function changedFiles(base: string): string[] | undefined {
  try {
    return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // An unknown base (the first push of a branch, a shallow clone): everything is run.
    return undefined;
  }
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "github-output": { type: "boolean", default: false } },
  });
  const base = positionals[0];
  if (base === undefined) throw new Error("usage: select-e2e.ts <base commit> [--github-output]");
  const map = JSON.parse(readFileSync("e2e/relevant.json", "utf8")) as RelevantMap;
  const changed = /^0+$/.test(base) ? undefined : changedFiles(base);
  const selection: Selection =
    changed === undefined ? { mode: "all", specs: [] } : selectE2e(changed, map);
  const all = specFiles();
  const specs = selection.mode === "all" ? all : selection.specs;
  const rest = all.filter((spec) => !specs.includes(spec));
  console.log(`mode=${selection.mode}\nspecs=${specs.join(" ")}\nrest=${rest.join(" ")}`);
  const file = process.env.GITHUB_OUTPUT;
  if (values["github-output"] && file) {
    appendFileSync(
      file,
      `mode=${selection.mode}\nspecs=${specs.join(" ")}\nrest=${rest.join(" ")}\n`,
    );
  }
}
