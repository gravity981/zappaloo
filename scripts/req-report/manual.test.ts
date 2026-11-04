import { describe, expect, it } from "vitest";
import { manualTestCases, parseManualProtocol } from "./manual.ts";

const protocol = (...rows: string[]) =>
  [
    "# Manual test protocol",
    "",
    "| Requirements | Date | Tester | Environment | Result | Notes |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "Text after the table.",
  ].join("\n");

describe("manual test protocol", () => {
  it("reads records with one or more requirement IDs", () => {
    const { records, errors } = parseManualProtocol(
      protocol(
        "| OPS-09 | 2026-11-05 | gravity981 | GitHub settings | pass | PR required |",
        "| OPS-02, OPS-03 | 2026-11-20 | gravity981 | prod VPS | fail | port 22 open |",
      ),
    );
    expect(errors).toEqual([]);
    expect(records.map((r) => [r.ids, r.result, r.line])).toEqual([
      [["OPS-09"], "pass", 5],
      [["OPS-02", "OPS-03"], "fail", 6],
    ]);
  });

  it("reports malformed records", () => {
    const { records, errors } = parseManualProtocol(
      protocol(
        "| OPS-09 | 5.11.2026 | gravity981 | GitHub | pass | |",
        "| OPS-09 | 2026-11-05 | | GitHub | ok | |",
      ),
    );
    expect(records).toHaveLength(1);
    expect(errors).toEqual([
      'manual-test-protocol.md:5: date "5.11.2026" is not YYYY-MM-DD',
      'manual-test-protocol.md:6: result "ok" must be pass or fail',
    ]);
  });

  it("ignores tables with other columns", () => {
    const { records } = parseManualProtocol(
      "| ID | Requirement | Prio |\n|---|---|---|\n| OPS-09 | x | Must |",
    );
    expect(records).toEqual([]);
  });

  it("counts only the latest record of each requirement", () => {
    const { records } = parseManualProtocol(
      protocol(
        "| OPS-05 | 2026-12-01 | gravity981 | prod | fail | restore failed |",
        "| OPS-05, OPS-13 | 2026-12-03 | gravity981 | LAN staging | pass | restore drill |",
        "| OPS-13 | 2026-12-02 | gravity981 | LAN staging | fail | older |",
      ),
    );
    expect(manualTestCases(records).map((t) => [t.ids[0], t.status, t.runner])).toEqual([
      ["OPS-05", "passed", "manual"],
      ["OPS-13", "passed", "manual"],
    ]);
  });
});
