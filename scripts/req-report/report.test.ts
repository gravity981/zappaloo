import { describe, expect, it } from "vitest";
import { renderHtml, renderSummaryMarkdown } from "./html.ts";
import { buildReport, progressByEpic, renderConsole } from "./report.ts";
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
    epics: [
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
    expect(report.rows.map((r) => [r.id, r.implemented, r.status, r.epic])).toEqual([
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

  it("warns about passing requirements still on the list, and requirements without a epic", () => {
    const report = buildReport(
      input({
        notImplemented: new Set(["AB-02", "AB-03"]),
        epics: [{ number: 1, title: "One", ids: ["AB-01"] }],
      }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      "AB-02 is not planned in any epic of the backlog",
      'AB-02 has passing tests but is still on the "not yet implemented" list',
      "AB-03 is not planned in any epic of the backlog",
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

describe("progressByEpic", () => {
  it("counts planned, implemented and remaining requirements per epic", () => {
    expect(progressByEpic(buildReport(input()))).toEqual([
      { epic: 1, title: "One", planned: 2, implemented: 2, remaining: 0 },
      { epic: 2, title: "Two", planned: 1, implemented: 0, remaining: 1 },
    ]);
  });
});

describe("rendering", () => {
  it("[OPS-19] renders the HTML report with a collapsed tree: epic, requirement, tests", () => {
    const html = renderHtml(buildReport(input()));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<p class="result ok">OK</p>');
    expect(html).toContain("Epic 1");
    expect(html).toContain('<span class="id">AB-01</span>');
    expect(html).toContain("✓");
    expect(html).toContain("[AB-01] a test");
    expect(html).toContain("not yet implemented");
    // Withdrawn requirements are not in the tree.
    expect(html).not.toContain("AB-04");
    // Everything starts collapsed: no details element is open, and the page is self-contained.
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).not.toMatch(/<link |src="http/);
    expect(html.match(/<details/g)?.length).toBe(5); // two epics and three requirements
    expect(html).toContain("Expand all");
    expect(html).toContain("Collapse all");
  });

  it("[OPS-19] escapes what comes from titles and error texts", () => {
    const report = buildReport(
      input({ tests: [test(["AB-01"], "passed", "<script>alert(1)</script> & more")] }),
    );
    const html = renderHtml(report);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(html).not.toContain("<script>alert(1)");
  });

  it("[OPS-19] lists errors and warnings in their own collapsed nodes", () => {
    const html = renderHtml(buildReport(input({ tests: [] })));
    expect(html).toContain('<p class="result failed">FAILED (2 error(s))</p>');
    expect(html).toContain("<b>Errors (2)</b>");
  });

  it("[OPS-19] the summary for a GitHub run is short and says where the report is", () => {
    const summary = renderSummaryMarkdown(buildReport(input()), "requirement-report");
    expect(summary).toContain("**Result:** OK");
    expect(summary).toContain("| 1 | One | 2 of 2 | 0 |");
    expect(summary).toContain("requirements.html");
    expect(summary).toContain("**requirement-report**");
    expect(summary).not.toContain("AB-01");
    // Many problems are cut off with a count.
    const many = buildReport(
      input({ inputErrors: Array.from({ length: 25 }, (_, i) => `e${String(i)}`) }),
    );
    expect(renderSummaryMarkdown(many, "x")).toContain("… and 15 more");
  });

  it("shows errors in the console output", () => {
    const report = buildReport(input({ tests: [] }));
    expect(renderConsole(report)).toContain("Result: FAILED");
  });
});
