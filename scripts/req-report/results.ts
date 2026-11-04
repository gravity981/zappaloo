// Reading test results from the JSON reporters of Vitest and Playwright.

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestCase {
  runner: "vitest" | "playwright";
  file: string;
  /** Title as written in the test (`it("[ABC-01] …")`). */
  title: string;
  /** Playwright project (browser/viewport); undefined for Vitest. */
  project?: string;
  status: TestStatus;
  /** Requirement IDs tagged at the start of the title. */
  ids: string[];
}

const LEADING_TAGS = /^\s*((?:\[[^\]]*\]\s*)+)/;

/**
 * Returns the bracketed tags at the start of a title: "[ABC-01][ABC-02] does x"
 * gives ["ABC-01", "ABC-02"]. The values are not validated here, so the report
 * can flag malformed or unknown IDs.
 */
export function extractTags(title: string): string[] {
  const match = LEADING_TAGS.exec(title);
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/\[([^\]]*)\]/g)].map((tag) => (tag[1] ?? "").trim());
}

// Minimal shapes of the reporter output; only the fields used here.
interface VitestJson {
  testResults: {
    name: string;
    assertionResults: { title: string; status: string }[];
  }[];
}

interface PlaywrightSuite {
  title: string;
  file: string;
  specs: {
    title: string;
    file: string;
    tests: { projectName: string; status: string }[];
  }[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightJson {
  suites: PlaywrightSuite[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseVitestResults(json: unknown): TestCase[] {
  if (!isObject(json) || !Array.isArray(json.testResults)) {
    throw new Error("not a Vitest JSON report (missing testResults)");
  }
  const report = json as unknown as VitestJson;
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      runner: "vitest" as const,
      file: file.name,
      title: test.title,
      status: vitestStatus(test.status),
      ids: extractTags(test.title),
    })),
  );
}

function vitestStatus(status: string): TestStatus {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  return "skipped"; // skipped, pending, todo, disabled
}

export function parsePlaywrightResults(json: unknown): TestCase[] {
  if (!isObject(json) || !Array.isArray(json.suites)) {
    throw new Error("not a Playwright JSON report (missing suites)");
  }
  const report = json as unknown as PlaywrightJson;
  const tests: TestCase[] = [];
  const visit = (suite: PlaywrightSuite): void => {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        tests.push({
          runner: "playwright",
          file: spec.file,
          title: spec.title,
          project: test.projectName,
          status: playwrightStatus(test.status),
          ids: extractTags(spec.title),
        });
      }
    }
    suite.suites?.forEach(visit);
  };
  report.suites.forEach(visit);
  return tests;
}

function playwrightStatus(status: string): TestStatus {
  if (status === "expected" || status === "flaky") return "passed";
  if (status === "unexpected") return "failed";
  return "skipped";
}
