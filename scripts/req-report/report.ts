// Combines requirements, the "not yet implemented" list, the epics of the backlog and the
// test results into the requirement report (spec/test-strategy.md, section 3).

import type { Epic, Priority, Requirement } from "./spec.ts";
import { isRequirementId } from "./spec.ts";
import type { TestCase } from "./results.ts";

/**
 * - passed: at least one passing test and none failing
 * - failed: at least one failing test
 * - untested: no passing or failing test (none, or only skipped)
 */
export type RequirementStatus = "passed" | "failed" | "untested";

export interface RequirementRow {
  id: string;
  priority: Priority;
  text: string;
  implemented: boolean;
  status: RequirementStatus;
  epic: number | null;
  tests: TestCase[];
}

export interface Report {
  rows: RequirementRow[];
  epics: Epic[];
  totals: {
    ids: number;
    active: number;
    withdrawn: number;
    implemented: number;
    implementedPassing: number;
    notImplemented: number;
    tests: { runner: TestCase["runner"]; total: number; tagged: number }[];
  };
  /** Each error makes the report fail (non-zero exit). */
  errors: string[];
  warnings: string[];
}

export interface ReportInput {
  requirements: Requirement[];
  notImplemented: Set<string>;
  epics: Epic[];
  tests: TestCase[];
  /** Errors found while reading the inputs; they are carried into the report. */
  inputErrors?: string[];
}

function statusOf(tests: TestCase[]): RequirementStatus {
  if (tests.some((test) => test.status === "failed")) return "failed";
  if (tests.some((test) => test.status === "passed")) return "passed";
  return "untested";
}

function describeTest(test: TestCase): string {
  const project = test.project ? ` (${test.project})` : "";
  return `${test.file}: "${test.title}"${project}`;
}

export function buildReport(input: ReportInput): Report {
  const errors = [...(input.inputErrors ?? [])];
  const warnings: string[] = [];
  const byId = new Map(input.requirements.map((req) => [req.id, req]));

  // Tests: every tag must name an existing, active requirement.
  const testsById = new Map<string, TestCase[]>();
  for (const test of input.tests) {
    for (const id of test.ids) {
      const where = `${test.runner} ${describeTest(test)}`;
      if (!isRequirementId(id)) {
        errors.push(`${where}: malformed requirement tag [${id}]`);
        continue;
      }
      const req = byId.get(id);
      if (!req) {
        errors.push(`${where}: unknown requirement ${id}`);
        continue;
      }
      if (req.withdrawn) {
        errors.push(`${where}: requirement ${id} is withdrawn`);
        continue;
      }
      const list = testsById.get(id) ?? [];
      list.push(test);
      testsById.set(id, list);
    }
  }

  // "Not yet implemented" list: only active requirements.
  for (const id of input.notImplemented) {
    const req = byId.get(id);
    if (!req)
      errors.push(`test-strategy.md: "not yet implemented" lists unknown requirement ${id}`);
    else if (req.withdrawn) {
      errors.push(`test-strategy.md: "not yet implemented" lists withdrawn requirement ${id}`);
    }
  }

  // Epic assignment from the backlog (spec/backlog/epics/).
  const epicOf = new Map<string, number>();
  for (const epic of input.epics) {
    for (const id of epic.ids) {
      const req = byId.get(id);
      if (!req) {
        errors.push(`backlog: epic ${epic.number} lists unknown requirement ${id}`);
        continue;
      }
      if (req.withdrawn) {
        errors.push(`backlog: epic ${epic.number} lists withdrawn requirement ${id}`);
        continue;
      }
      const previous = epicOf.get(id);
      if (previous !== undefined && previous !== epic.number) {
        warnings.push(`${id} is planned in epic ${previous} and epic ${epic.number}`);
      }
      if (previous === undefined) epicOf.set(id, epic.number);
    }
  }

  const rows: RequirementRow[] = [];
  for (const req of input.requirements) {
    if (req.withdrawn || req.priority === null) continue;
    const tests = testsById.get(req.id) ?? [];
    const row: RequirementRow = {
      id: req.id,
      priority: req.priority,
      text: req.text,
      implemented: !input.notImplemented.has(req.id),
      status: statusOf(tests),
      epic: epicOf.get(req.id) ?? null,
      tests,
    };
    rows.push(row);

    if (row.epic === null && input.epics.length > 0) {
      warnings.push(`${req.id} is not planned in any epic of the backlog`);
    }
    if (row.status === "failed") {
      const failing = tests.filter((test) => test.status === "failed").map(describeTest);
      errors.push(`${req.id}: failing test(s): ${failing.join("; ")}`);
    } else if (row.implemented && row.status === "untested") {
      errors.push(
        `${req.id} is implemented (not on the "not yet implemented" list) but has no passing test`,
      );
    } else if (!row.implemented && row.status === "passed") {
      warnings.push(`${req.id} has passing tests but is still on the "not yet implemented" list`);
    }
  }

  const runners: TestCase["runner"][] = ["vitest", "playwright", "manual"];
  const implementedRows = rows.filter((row) => row.implemented);
  return {
    rows,
    epics: input.epics,
    totals: {
      ids: input.requirements.length,
      active: rows.length,
      withdrawn: input.requirements.length - rows.length,
      implemented: implementedRows.length,
      implementedPassing: implementedRows.filter((row) => row.status === "passed").length,
      notImplemented: rows.length - implementedRows.length,
      tests: runners.map((runner) => {
        const ofRunner = input.tests.filter((test) => test.runner === runner);
        return {
          runner,
          total: ofRunner.length,
          tagged: ofRunner.filter((test) => test.ids.length > 0).length,
        };
      }),
    },
    errors,
    warnings,
  };
}

export interface EpicProgress {
  epic: number | null;
  title: string;
  planned: number;
  implemented: number;
  remaining: number;
}

/** Requirements per epic: planned, implemented and remaining (for the status reports). */
export function progressByEpic(report: Report): EpicProgress[] {
  const result: EpicProgress[] = report.epics.map((epic) => {
    const rows = report.rows.filter((row) => row.epic === epic.number);
    const implemented = rows.filter((row) => row.implemented).length;
    return {
      epic: epic.number,
      title: epic.title,
      planned: rows.length,
      implemented,
      remaining: rows.length - implemented,
    };
  });
  const unassigned = report.rows.filter((row) => row.epic === null);
  if (unassigned.length > 0) {
    const implemented = unassigned.filter((row) => row.implemented).length;
    result.push({
      epic: null,
      title: "(no epic)",
      planned: unassigned.length,
      implemented,
      remaining: unassigned.length - implemented,
    });
  }
  return result;
}

const STATUS_LABEL: Record<RequirementStatus, string> = {
  passed: "pass",
  failed: "FAIL",
  untested: "no test",
};

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

/** Full report as Markdown: summary, epics, problems, and one row per active requirement. */
export function renderMarkdown(report: Report): string {
  const { totals } = report;
  const out: string[] = [];
  out.push("# Requirement report", "");
  out.push(
    `**Result:** ${report.errors.length === 0 ? "OK" : `FAILED (${report.errors.length} error(s))`}`,
    "",
  );
  out.push(
    `- Requirements: ${totals.ids} IDs, ${totals.active} active, ${totals.withdrawn} withdrawn`,
    `- Implemented: ${totals.implemented} of ${totals.active} active, ${totals.implementedPassing} with passing tests; ${totals.notImplemented} not yet implemented`,
    ...totals.tests.map(
      (t) => `- ${t.runner}: ${t.total} test result(s), ${t.tagged} tagged with requirement IDs`,
    ),
    "",
  );

  out.push(
    "## Epics",
    "",
    "| Epic | Title | Planned | Implemented | Remaining |",
    "|---|---|---|---|---|",
  );
  for (const p of progressByEpic(report)) {
    out.push(
      `| ${p.epic ?? "–"} | ${p.title} | ${p.planned} | ${p.implemented} | ${p.remaining} |`,
    );
  }
  out.push("");

  if (report.errors.length > 0) {
    out.push("## Errors", "", ...report.errors.map((e) => `- ${e}`), "");
  }
  if (report.warnings.length > 0) {
    out.push("## Warnings", "", ...report.warnings.map((w) => `- ${w}`), "");
  }

  out.push(
    "## Requirements",
    "",
    "| ID | Prio | Epic | Implemented | Status | Tests |",
    "|---|---|---|---|---|---|",
  );
  for (const row of report.rows) {
    const tests = row.tests
      .map(
        (t) =>
          `${t.status === "passed" ? "✓" : t.status === "failed" ? "✗" : "–"} ${t.runner}${t.project ? `/${t.project}` : ""}: ${t.title}`,
      )
      .join("<br>");
    out.push(
      `| ${row.id} | ${row.priority} | ${row.epic ?? "–"} | ${row.implemented ? "yes" : "not yet"} | ${STATUS_LABEL[row.status]} | ${escapeCell(tests)} |`,
    );
  }
  out.push("");
  return out.join("\n");
}

/** Short console summary: totals, epics, errors, warnings, and the implemented requirements. */
export function renderConsole(report: Report): string {
  const { totals } = report;
  const out: string[] = [];
  out.push("Requirement report");
  out.push(
    `  Requirements: ${totals.ids} IDs, ${totals.active} active, ${totals.withdrawn} withdrawn`,
  );
  out.push(
    `  Implemented:  ${totals.implemented} of ${totals.active} active (${totals.implementedPassing} passing), ${totals.notImplemented} not yet implemented`,
  );
  for (const t of totals.tests) {
    out.push(`  ${t.runner.padEnd(12)}${t.total} test result(s), ${t.tagged} tagged`);
  }
  out.push("", "   Epic  Implemented / planned  Remaining");
  for (const p of progressByEpic(report)) {
    const epic = String(p.epic ?? "–").padStart(5);
    out.push(
      `  ${epic}  ${`${p.implemented} / ${p.planned}`.padEnd(21)}  ${p.remaining}   ${p.title}`,
    );
  }

  const implemented = report.rows.filter((row) => row.implemented);
  if (implemented.length > 0) {
    out.push("", "  Implemented requirements:");
    for (const row of implemented) {
      const passing = row.tests.filter((t) => t.status === "passed").length;
      out.push(
        `    ${STATUS_LABEL[row.status].padEnd(8)}${row.id.padEnd(9)}${passing} passing test(s)`,
      );
    }
  }
  if (report.warnings.length > 0) {
    out.push(
      "",
      `  Warnings (${report.warnings.length}):`,
      ...report.warnings.map((w) => `    - ${w}`),
    );
  }
  if (report.errors.length > 0) {
    out.push("", `  ERRORS (${report.errors.length}):`, ...report.errors.map((e) => `    - ${e}`));
  }
  out.push("", report.errors.length === 0 ? "  Result: OK" : "  Result: FAILED");
  return out.join("\n");
}
