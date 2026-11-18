// npm run req-report [-- --spec-dir spec --vitest reports/vitest.json,reports/vitest-deploy.json
//                       --playwright reports/playwright.json,reports/playwright-flaky.json
//                       --out reports/requirements.md]
//
// Reads the spec and the JSON test results, prints a summary, writes the full
// report as Markdown, and exits non-zero on any error (spec/test-strategy.md, 3).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildReport, renderConsole, renderMarkdown } from "./report.ts";
import type { TestCase } from "./results.ts";
import { manualTestCases, parseManualProtocol } from "./manual.ts";
import { parsePlaywrightResults, parseVitestResults } from "./results.ts";
import { parseEpics, parseNotImplemented, parseRequirements } from "./spec.ts";

const { values: args } = parseArgs({
  options: {
    "spec-dir": { type: "string", default: "spec" },
    // Comma-separated: the main run and the deployment test (npm run test:deploy)
    vitest: { type: "string", default: "reports/vitest.json,reports/vitest-deploy.json" },
    // Comma-separated: the main run and the run of the flaky tests (npm run test:e2e:flaky)
    playwright: {
      type: "string",
      default: "reports/playwright.json,reports/playwright-flaky.json",
    },
    out: { type: "string", default: "reports/requirements.md" },
  },
});

const inputErrors: string[] = [];
const read = (path: string): string => readFileSync(path, "utf8");

const requirements = parseRequirements(read(join(args["spec-dir"], "sw-architecture.md")));
const notImplemented = parseNotImplemented(read(join(args["spec-dir"], "test-strategy.md")));
const epicsDir = join(args["spec-dir"], "backlog", "epics");
const epics = parseEpics(
  readdirSync(epicsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name, markdown: read(join(epicsDir, name)) })),
);
inputErrors.push(...requirements.errors, ...notImplemented.errors, ...epics.errors);

const tests: TestCase[] = [];
const results: [string, (json: unknown) => TestCase[]][] = [
  ...args.vitest
    .split(",")
    .map((path): [string, (json: unknown) => TestCase[]] => [path.trim(), parseVitestResults]),
  ...args.playwright
    .split(",")
    .map((path): [string, (json: unknown) => TestCase[]] => [path.trim(), parsePlaywrightResults]),
];
for (const [path, parse] of results) {
  if (!existsSync(path)) {
    // The run of the flaky tests may not have happened; the report then says so as a warning.
    if (path.endsWith("playwright-flaky.json")) {
      console.warn(`${path}: not found, the flaky tests did not run (npm run test:e2e:flaky)`);
    } else inputErrors.push(`${path}: test results not found (run the tests first)`);
    continue;
  }
  try {
    tests.push(...parse(JSON.parse(read(path))));
  } catch (error) {
    inputErrors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Manual checks (test-strategy.md 6.1); the protocol is optional.
const protocolPath = join(args["spec-dir"], "manual-test-protocol.md");
if (existsSync(protocolPath)) {
  const manual = parseManualProtocol(read(protocolPath));
  inputErrors.push(...manual.errors);
  tests.push(...manualTestCases(manual.records));
}

const report = buildReport({
  requirements: requirements.value,
  notImplemented: notImplemented.value.ids,
  epics: epics.value,
  tests,
  inputErrors,
});

const markdown = renderMarkdown(report);
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, markdown);
// In GitHub Actions, the full report also appears on the run's summary page.
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

console.log(renderConsole(report));
console.log(`  Full report: ${args.out}`);
process.exitCode = report.errors.length === 0 ? 0 : 1;
