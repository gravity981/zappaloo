// Checks the real spec files, so that an edit that breaks the requirement
// report's parsing (or makes the lists inconsistent) fails in CI right away.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "./report.ts";
import { parseNotImplemented, parseRequirements, parseStages } from "./spec.ts";

const specDir = join(import.meta.dirname, "../../spec");
const read = (file: string) => readFileSync(join(specDir, file), "utf8");

describe("the project spec", () => {
  const requirements = parseRequirements(read("sw-architecture.md"));
  const notImplemented = parseNotImplemented(read("test-strategy.md"));
  const stages = parseStages(read("implementation-plan.md"));

  it("has requirement tables without parse errors", () => {
    expect(requirements.errors).toEqual([]);
    expect(requirements.value.length).toBeGreaterThan(0);
  });

  it("has a consistent not-yet-implemented list", () => {
    expect(notImplemented.errors).toEqual([]);
  });

  it("plans stages 1 to 10", () => {
    expect(stages.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("lists only active requirements as not implemented, and plans every active requirement in a stage", () => {
    const report = buildReport({
      requirements: requirements.value,
      notImplemented: notImplemented.value.ids,
      stages,
      tests: [],
    });
    const listErrors = report.errors.filter((e) => !e.includes("has no passing test"));
    expect(listErrors).toEqual([]);
    expect(report.warnings.filter((w) => w.includes("not planned in any stage"))).toEqual([]);
  });
});
