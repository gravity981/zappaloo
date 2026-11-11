// Manual test protocol (spec/manual-test-protocol.md, test-strategy.md 6.1):
// checks that need a real environment or device. Each record is a table row
//   | Requirements | Date | Environment | Result | Notes |
// with one or more requirement IDs, an ISO date and the result `pass` or `fail`.
// For each requirement only its latest record counts, so a later successful
// re-check replaces an earlier failure.
import type { TestCase } from "./results.ts";

export interface ManualRecord {
  ids: string[];
  date: string;
  environment: string;
  result: "pass" | "fail";
  notes: string;
  line: number;
}

const HEADER = ["Requirements", "Date", "Environment", "Result", "Notes"];

export function parseManualProtocol(markdown: string): {
  records: ManualRecord[];
  errors: string[];
} {
  const records: ManualRecord[] = [];
  const errors: string[] = [];
  let inTable = false;

  markdown.split("\n").forEach((line, index) => {
    const where = `manual-test-protocol.md:${index + 1}`;
    if (!line.startsWith("|")) {
      inTable = false;
      return;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.join("|") === HEADER.join("|")) {
      inTable = true;
      return;
    }
    if (!inTable || cells.every((cell) => /^:?-+:?$/.test(cell))) return;

    const [ids = "", date = "", environment = "", result = "", notes = ""] = cells;
    const idList = ids.split(/[,\s]+/).filter(Boolean);
    if (idList.length === 0) errors.push(`${where}: no requirement ID`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      errors.push(`${where}: date "${date}" is not YYYY-MM-DD`);
    if (result !== "pass" && result !== "fail") {
      errors.push(`${where}: result "${result}" must be pass or fail`);
      return;
    }
    records.push({ ids: idList, date, environment, result, notes, line: index + 1 });
  });
  return { records, errors };
}

/** One test case per requirement, from its latest record (by date, then by position). */
export function manualTestCases(records: ManualRecord[]): TestCase[] {
  const latest = new Map<string, ManualRecord>();
  for (const record of records) {
    for (const id of record.ids) {
      const previous = latest.get(id);
      if (!previous || record.date >= previous.date) latest.set(id, record);
    }
  }
  return [...latest].map(([id, record]) => ({
    runner: "manual" as const,
    file: `spec/manual-test-protocol.md:${record.line}`,
    title: `${record.date} ${record.environment}${record.notes ? `: ${record.notes}` : ""}`,
    status: record.result === "pass" ? ("passed" as const) : ("failed" as const),
    ids: [id],
  }));
}
