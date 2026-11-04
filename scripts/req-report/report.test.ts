import { describe, expect, it } from "vitest";
import { buildReport, progressByStage, renderConsole, renderMarkdown } from "./report.ts";
import type { ReportInput } from "./report.ts";
import type { TestCase } from "./results.ts";
import type { Requirement } from "./spec.ts";

function req(id: string, priority: Requirement["priority"] = "Must"): Requirement {
  return {
    id,
    prefix: id.split("-")[0] ?? "",
    text: `Text of ${id}`,
    priority,
    withdrawn: priority === null,
    line: 1,
  };
}

function test(ids: string[], status: TestCase["status"] = "passed", title = "a test"): TestCase {
  return {
    runner: "vitest",
    file: "x.test.ts",
    title: `${ids.map((id) => `[${id}]`).join("")} ${title}`,
    status,
    ids,
  };
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    requirements: [req("AB-01"), req("AB-02"), req("AB-03", "Should"), req("AB-04", null)],
    notImplemented: new Set(["AB-03"]),
    stages: [
      { number: 1, title: "One", ids: ["AB-01", "AB-02"] },
      { number: 2, title: "Two", ids: ["AB-03"] },
    ],
    tests: [test(["AB-01"]), test(["AB-02"])],
    ...overrides,
  };
}

describe("buildReport", () => {
  it("passes when every implemented requirement has a passing test", () => {
    const report = buildReport(input());
    expect(report.errors).toEqual([]);
    expect(report.totals).toMatchObject({
      ids: 4,
      active: 3,
      withdrawn: 1,
      implemented: 2,
      implementedPassing: 2,
      notImplemented: 1,
    });
    expect(report.rows.map((r) => [r.id, r.implemented, r.status, r.stage])).toEqual([
      ["AB-01", true, "passed", 1],
      ["AB-02", true, "passed", 1],
      ["AB-03", false, "untested", 2],
    ]);
  });

  it("fails when an implemented requirement has no test or only skipped tests", () => {
    const report = buildReport(input({ tests: [test(["AB-01"]), test(["AB-02"], "skipped")] }));
    expect(report.errors).toEqual([
      'AB-02 is implemented (not on the "not yet implemented" list) but has no passing test',
    ]);
  });

  it("fails when a tagged test fails, even if another test of the requirement passes", () => {
    const report = buildReport(
      input({ tests: [test(["AB-01"]), test(["AB-01"], "failed"), test(["AB-02"])] }),
    );
    expect(report.rows[0]?.status).toBe("failed");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(/^AB-01: failing test/);
  });

  it("fails on tests tagged with unknown, withdrawn or malformed IDs", () => {
    const report = buildReport(
      input({
        tests: [test(["AB-01"]), test(["AB-02"]), test(["ZZ-01"]), test(["AB-04"]), test(["ab-1"])],
      }),
    );
    expect(report.errors).toHaveLength(3);
    expect(report.errors.join("\n")).toMatch(/unknown requirement ZZ-01/);
    expect(report.errors.join("\n")).toMatch(/requirement AB-04 is withdrawn/);
    expect(report.errors.join("\n")).toMatch(/malformed requirement tag \[ab-1\]/);
  });

  it("fails when the not-yet-implemented list names unknown or withdrawn requirements", () => {
    const report = buildReport(input({ notImplemented: new Set(["AB-03", "AB-04", "ZZ-09"]) }));
    expect(report.errors).toHaveLength(2);
  });

  it("does not require tests for requirements that are not implemented yet", () => {
    const report = buildReport(
      input({ notImplemented: new Set(["AB-01", "AB-02", "AB-03"]), tests: [] }),
    );
    expect(report.errors).toEqual([]);
    expect(report.totals.implemented).toBe(0);
  });

  it("warns about passing requirements still on the list, and requirements without a stage", () => {
    const report = buildReport(
      input({
        notImplemented: new Set(["AB-02", "AB-03"]),
        stages: [{ number: 1, title: "One", ids: ["AB-01"] }],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      "AB-02 is not planned in any stage of implementation-plan.md",
      'AB-02 has passing tests but is still on the "not yet implemented" list',
      "AB-03 is not planned in any stage of implementation-plan.md",
    ]);
  });

  it("carries input errors into the report", () => {
    const report = buildReport(
      input({ inputErrors: ["reports/vitest.json: test results not found"] }),
    );
    expect(report.errors).toEqual(["reports/vitest.json: test results not found"]);
  });

  it("counts test results per runner, tagged and untagged", () => {
    const untagged: TestCase = { ...test([]), runner: "playwright", project: "desktop-chromium" };
    const report = buildReport(input({ tests: [test(["AB-01"]), test(["AB-02"]), untagged] }));
    expect(report.totals.tests).toEqual([
      { runner: "vitest", total: 2, tagged: 2 },
      { runner: "playwright", total: 1, tagged: 0 },
      { runner: "manual", total: 0, tagged: 0 },
    ]);
  });
});

describe("progressByStage", () => {
  it("counts planned, implemented and remaining requirements per stage", () => {
    expect(progressByStage(buildReport(input()))).toEqual([
      { stage: 1, title: "One", planned: 2, implemented: 2, remaining: 0 },
      { stage: 2, title: "Two", planned: 1, implemented: 0, remaining: 1 },
    ]);
  });
});

describe("rendering", () => {
  it("renders the Markdown report with one row per active requirement", () => {
    const markdown = renderMarkdown(buildReport(input()));
    expect(markdown).toContain("**Result:** OK");
    expect(markdown).toContain("| AB-01 | Must | 1 | yes | pass | ✓ vitest: [AB-01] a test |");
    expect(markdown).toContain("| AB-03 | Should | 2 | not yet | no test |  |");
    expect(markdown).not.toContain("AB-04");
  });

  it("shows errors in both outputs", () => {
    const report = buildReport(input({ tests: [] }));
    expect(renderMarkdown(report)).toContain("FAILED (2 error(s))");
    expect(renderConsole(report)).toContain("Result: FAILED");
  });
});
