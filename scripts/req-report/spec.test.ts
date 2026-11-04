import { describe, expect, it } from "vitest";
import { expandIdList, parseNotImplemented, parseRequirements, parseStages } from "./spec.ts";

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

describe("parseStages", () => {
  it("reads stage numbers, titles and the IDs of their Requirements lines", () => {
    const plan = [
      "## 3. Stages",
      "### Stage 1 – Walking Skeleton",
      "**1a – Tooling.**",
      "Requirements: none (foundation).",
      "**1b – Skeleton.** Mentions AB-09 in prose.",
      "Requirements: AB-01, AB-02.",
      "### Stage 2 – Accounts",
      "Requirements: CD-01.",
      "## 4. Template",
      "Requirements: XY-01.",
    ].join("\n");
    expect(parseStages(plan)).toEqual([
      { number: 1, title: "Walking Skeleton", ids: ["AB-01", "AB-02"] },
      { number: 2, title: "Accounts", ids: ["CD-01"] },
    ]);
  });
});
