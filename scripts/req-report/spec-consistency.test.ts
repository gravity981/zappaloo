// Checks the real spec files, so that an edit that breaks the requirement
// report's parsing (or makes the lists inconsistent) fails in CI right away.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "./report.ts";
import {
  checkEpicStatuses,
  parseEpicHeader,
  parseEpics,
  parseNotImplemented,
  parseRequirements,
  parseRoadmap,
} from "./spec.ts";

const specDir = join(import.meta.dirname, "../../spec");
const read = (file: string) => readFileSync(join(specDir, file), "utf8");
const epicsDir = join(specDir, "backlog/epics");

describe("the project spec", () => {
  const requirements = parseRequirements(read("sw-architecture.md"));
  const notImplemented = parseNotImplemented(read("test-strategy.md"));
  const epics = parseEpics(
    readdirSync(epicsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => ({ name, markdown: readFileSync(join(epicsDir, name), "utf8") })),
  );

  it("has requirement tables without parse errors", () => {
    expect(requirements.errors).toEqual([]);
    expect(requirements.value.length).toBeGreaterThan(0);
  });

  it("has a consistent not-yet-implemented list", () => {
    expect(notImplemented.errors).toEqual([]);
  });

  it("plans epics 1 to 10, with 3.5, 3.9, 5.1 and 5.2 inserted", () => {
    expect(epics.errors).toEqual([]);
    expect(epics.value.map((e) => e.number)).toEqual([
      1, 2, 3, 3.5, 3.9, 4, 5, 5.1, 5.2, 6, 7, 8, 9, 10,
    ]);
  });

  it("lists only active requirements as not implemented, and plans every active requirement in an epic", () => {
    const report = buildReport({
      requirements: requirements.value,
      notImplemented: notImplemented.value.ids,
      epics: epics.value,
      tests: [],
    });
    const listErrors = report.errors.filter((e) => !e.includes("has no passing test"));
    expect(listErrors).toEqual([]);
    expect(report.warnings.filter((w) => w.includes("not planned in any epic"))).toEqual([]);
  });

  it("keeps the statuses and dependencies of the epics consistent with each other and the roadmap", () => {
    const headers = readdirSync(epicsDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => {
        const markdown = readFileSync(join(epicsDir, name), "utf8");
        const header = parseEpicHeader(markdown) ?? { status: "(no header table)", dependsOn: [] };
        return { number: parseEpics([{ name, markdown }]).value[0]?.number ?? -1, ...header };
      });
    expect(checkEpicStatuses(headers, parseRoadmap(read("backlog/roadmap.md")))).toEqual([]);
  });
});
