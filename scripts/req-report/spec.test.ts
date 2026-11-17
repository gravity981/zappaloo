import { describe, expect, it } from "vitest";
import {
  checkEpicStatuses,
  expandIdList,
  parseEpic,
  parseEpicHeader,
  parseEpics,
  parseNotImplemented,
  parseRequirements,
  parseRoadmap,
} from "./spec.ts";

describe("parseRequirements", () => {
  const spec = [
    "# Topic",
    "",
    "| ID | Requirement | Prio |",
    "|---|---|---|",
    "| ABC-01 | Does a thing. | Must |",
    "| ABC-02 | ~~Old thing.~~ (withdrawn: reason) | – |",
    "| ABC-03 | Text with `code \\| pipe`. | Should |",
    "| XY-10 | Optional. | Could |",
    "Not a row: ABC-04 is mentioned in prose.",
  ].join("\n");

  it("reads ID, text, priority and line of every requirement row", () => {
    const { value, errors } = parseRequirements(spec);
    expect(errors).toEqual([]);
    expect(value.map((r) => [r.id, r.priority, r.withdrawn, r.line])).toEqual([
      ["ABC-01", "Must", false, 5],
      ["ABC-02", null, true, 6],
      ["ABC-03", "Should", false, 7],
      ["XY-10", "Could", false, 8],
    ]);
    expect(value[0]?.text).toBe("Does a thing.");
    expect(value[3]?.prefix).toBe("XY");
  });

  it("reports duplicate IDs and unknown priorities", () => {
    const { value, errors } = parseRequirements(
      ["| ABC-01 | One | Must |", "| ABC-01 | Again | Must |", "| ABC-02 | Two | High |"].join(
        "\n",
      ),
    );
    expect(value.map((r) => r.id)).toEqual(["ABC-01"]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/duplicate requirement ID ABC-01/);
    expect(errors[1]).toMatch(/ABC-02 has unknown priority "High"/);
  });
});

describe("expandIdList", () => {
  it("expands single IDs and en-dash ranges", () => {
    expect(expandIdList("PRES-01, PRES-02, PRES-04 – PRES-06, PRES-12").value).toEqual([
      "PRES-01",
      "PRES-02",
      "PRES-04",
      "PRES-05",
      "PRES-06",
      "PRES-12",
    ]);
  });

  it("accepts a hyphen as range separator", () => {
    expect(expandIdList("AB-08 - AB-10").value).toEqual(["AB-08", "AB-09", "AB-10"]);
  });

  it("rejects malformed items, mixed prefixes and backward ranges", () => {
    const { value, errors } = expandIdList("AB-1, AB-01 – CD-03, AB-05 – AB-02");
    expect(value).toEqual([]);
    expect(errors).toHaveLength(3);
  });
});

describe("parseNotImplemented", () => {
  const strategy = (rows: string[], total: string) =>
    [
      "## 5. Not yet implemented",
      "",
      "| Prefix | IDs | Count |",
      "|---|---|---|",
      ...rows,
      `| **Total** | | **${total}** |`,
      "",
      "## 6. Next section",
      "| XY | XY-01 | 1 |",
    ].join("\n");

  it("collects the IDs of all rows up to the next section", () => {
    const { value, errors } = parseNotImplemented(
      strategy(["| AB | AB-01 – AB-03 | 3 |", "| CD | CD-02 | 1 |"], "4"),
    );
    expect(errors).toEqual([]);
    expect([...value.ids]).toEqual(["AB-01", "AB-02", "AB-03", "CD-02"]);
    expect(value.statedTotal).toBe(4);
  });

  it("reports wrong row counts, wrong totals, duplicates and IDs in the wrong row", () => {
    const { errors } = parseNotImplemented(
      strategy(["| AB | AB-01 – AB-03 | 2 |", "| CD | CD-01, AB-01 | 2 |"], "9"),
    );
    expect(errors.join("\n")).toMatch(/row AB states count 2 but lists 3 IDs/);
    expect(errors.join("\n")).toMatch(/AB-01 is listed in the row of prefix CD/);
    expect(errors.join("\n")).toMatch(/AB-01 is listed twice/);
    expect(errors.join("\n")).toMatch(/total states 9 but the rows list 4 IDs/);
  });

  it("accepts an empty list once everything is implemented", () => {
    const { value, errors } = parseNotImplemented(strategy([], "0"));
    expect(errors).toEqual([]);
    expect(value.ids.size).toBe(0);
  });

  it("reports a missing section", () => {
    expect(parseNotImplemented("# Nothing here").errors).toHaveLength(1);
  });
});

describe("parseEpic", () => {
  it("reads the epic's number, title and the IDs of the Requirements lines of its stories", () => {
    const epic = [
      "# Epic 1 – Walking Skeleton",
      "## Refinement",
      "Requirements: XY-01.",
      "## Stories",
      "### Story 1a – Tooling",
      "Requirements: none (foundation).",
      "### Story 1b – Skeleton",
      "Mentions AB-09 in prose.",
      "Requirements: AB-01, AB-02.",
      "Re-verified: AB-03.",
      "## Report",
      "Requirements: XY-02.",
    ].join("\n");
    expect(parseEpic(epic)).toEqual({
      number: 1,
      title: "Walking Skeleton",
      ids: ["AB-01", "AB-02"],
    });
  });

  it("reads inserted epics with a decimal number", () => {
    expect(parseEpic("# Epic 3.5 – Installable App\n## Stories\nRequirements: PW-01.")).toEqual({
      number: 3.5,
      title: "Installable App",
      ids: ["PW-01"],
    });
  });

  it("returns undefined for a file without an epic heading", () => {
    expect(parseEpic("# Backlog\n## Stories\nRequirements: AB-01.")).toBeUndefined();
  });
});

describe("parseEpics", () => {
  it("orders the epics by number and reports files without an epic and duplicate numbers", () => {
    const result = parseEpics([
      { name: "epic-10-last.md", markdown: "# Epic 10 – Last" },
      { name: "epic-3.5-inserted.md", markdown: "# Epic 3.5 – Inserted" },
      { name: "epic-3-first.md", markdown: "# Epic 3 – First" },
      { name: "epic-3-again.md", markdown: "# Epic 3 – Again" },
      { name: "notes.md", markdown: "# Notes" },
    ]);
    expect(result.value.map((e) => e.number)).toEqual([3, 3, 3.5, 10]);
    expect(result.errors).toEqual([
      'notes.md: no "# Epic <n> – <title>" heading',
      "backlog: epic 3 has more than one file",
    ]);
  });
});

describe("parseEpicHeader", () => {
  it("reads the status and the dependencies from the header table", () => {
    const epic = [
      "# Epic 9 – Event Readiness",
      "",
      "| Status | Release | Depends on | Branch |",
      "|---|---|---|---|",
      "| in progress | Event-ready | 6, 7, 3.5 | `feature/epic-9-event-readiness` |",
    ].join("\n");
    expect(parseEpicHeader(epic)).toEqual({ status: "in progress", dependsOn: [6, 7, 3.5] });
  });

  it("reads an epic without dependencies, and none without a header table", () => {
    const epic =
      "| Status | Release | Depends on | Branch |\n|---|---|---|---|\n| done | R1 | – | x |";
    expect(parseEpicHeader(epic)).toEqual({ status: "done", dependsOn: [] });
    expect(parseEpicHeader("# Epic 1 – One")).toBeUndefined();
  });
});

describe("parseRoadmap", () => {
  it("reads the epic rows and skips the release rows", () => {
    const roadmap = [
      "| Epic | Content | Depends on | Status |",
      "|---|---|---|---|",
      "| [5](epics/epic-5-game-world.md) | Game world | 4 | done |",
      "| ▶ | **Opening** | | open |",
      "| [9](epics/epic-9-x.md) | Event readiness | 6, 7 | refined |",
    ].join("\n");
    expect(parseRoadmap(roadmap)).toEqual([
      { number: 5, status: "done", dependsOn: [4] },
      { number: 9, status: "refined", dependsOn: [6, 7] },
    ]);
  });
});

describe("checkEpicStatuses", () => {
  const epic = (number: number, status: string, dependsOn: number[] = []) => ({
    number,
    status,
    dependsOn,
  });

  it("accepts a consistent backlog", () => {
    const epics = [epic(1, "done"), epic(2, "ready", [1]), epic(3, "refined", [2])];
    expect(checkEpicStatuses(epics, epics)).toEqual([]);
  });

  it("refuses a ready or in-progress epic whose dependency is not done", () => {
    const epics = [epic(1, "in progress"), epic(2, "ready", [1]), epic(3, "in progress", [1])];
    expect(checkEpicStatuses(epics, epics)).toEqual([
      "epic 2 is ready, but epic 1 it depends on is in progress",
      "epic 3 is in progress, but epic 1 it depends on is in progress",
    ]);
  });

  it("refuses unknown statuses and dependencies, and a roadmap that disagrees with the files", () => {
    const epics = [epic(1, "next"), epic(2, "open", [7]), epic(3, "open")];
    const roadmap = [epic(1, "next"), epic(2, "ready", [7]), epic(4, "open")];
    expect(checkEpicStatuses(epics, roadmap)).toEqual([
      'epic 1: unknown status "next"',
      "epic 2: depends on epic 7, which does not exist",
      "roadmap.md: epic 2 is ready, but its file says open",
      "roadmap.md: epic 3 is missing",
      "roadmap.md: epic 4 has no file",
    ]);
  });
});
