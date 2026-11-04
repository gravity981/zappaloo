import { describe, expect, it } from "vitest";
import { extractTags, parsePlaywrightResults, parseVitestResults } from "./results.ts";

describe("extractTags", () => {
  it("reads all bracketed tags at the start of a title", () => {
    expect(extractTags("[ABC-01][ABC-02] does something")).toEqual(["ABC-01", "ABC-02"]);
    expect(extractTags("[ABC-01] [ABC-02] does something")).toEqual(["ABC-01", "ABC-02"]);
  });

  it("ignores tags that are not at the start", () => {
    expect(extractTags("does something [ABC-01]")).toEqual([]);
    expect(extractTags("plain title")).toEqual([]);
  });

  it("returns malformed tags as written, for the report to flag", () => {
    expect(extractTags("[abc-1] typo")).toEqual(["abc-1"]);
  });
});

describe("parseVitestResults", () => {
  it("maps every assertion to a test case with its status and tags", () => {
    const json = {
      testResults: [
        {
          name: "/repo/backend/src/a.test.ts",
          assertionResults: [
            { title: "[AB-01] passes", status: "passed" },
            { title: "[AB-02] fails", status: "failed" },
            { title: "[AB-03] skipped", status: "skipped" },
            { title: "todo", status: "todo" },
          ],
        },
      ],
    };
    expect(parseVitestResults(json)).toEqual([
      {
        runner: "vitest",
        file: "/repo/backend/src/a.test.ts",
        title: "[AB-01] passes",
        status: "passed",
        ids: ["AB-01"],
      },
      {
        runner: "vitest",
        file: "/repo/backend/src/a.test.ts",
        title: "[AB-02] fails",
        status: "failed",
        ids: ["AB-02"],
      },
      {
        runner: "vitest",
        file: "/repo/backend/src/a.test.ts",
        title: "[AB-03] skipped",
        status: "skipped",
        ids: ["AB-03"],
      },
      {
        runner: "vitest",
        file: "/repo/backend/src/a.test.ts",
        title: "todo",
        status: "skipped",
        ids: [],
      },
    ]);
  });

  it("rejects input that is not a Vitest report", () => {
    expect(() => parseVitestResults({ suites: [] })).toThrow(/Vitest/);
  });
});

describe("parsePlaywrightResults", () => {
  it("walks nested suites and reports one test case per project", () => {
    const json = {
      suites: [
        {
          title: "home.spec.ts",
          file: "home.spec.ts",
          specs: [
            {
              title: "[AB-01] loads",
              file: "home.spec.ts",
              tests: [
                { projectName: "desktop-chromium", status: "expected" },
                { projectName: "mobile-ios", status: "flaky" },
              ],
            },
          ],
          suites: [
            {
              title: "nested",
              file: "home.spec.ts",
              specs: [
                {
                  title: "[AB-02] breaks",
                  file: "home.spec.ts",
                  tests: [
                    { projectName: "desktop-chromium", status: "unexpected" },
                    { projectName: "mobile-ios", status: "skipped" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parsePlaywrightResults(json).map((t) => [t.ids[0], t.project, t.status])).toEqual([
      ["AB-01", "desktop-chromium", "passed"],
      ["AB-01", "mobile-ios", "passed"],
      ["AB-02", "desktop-chromium", "failed"],
      ["AB-02", "mobile-ios", "skipped"],
    ]);
  });

  it("rejects input that is not a Playwright report", () => {
    expect(() => parsePlaywrightResults({ testResults: [] })).toThrow(/Playwright/);
  });
});
