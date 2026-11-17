// Parsing of the requirement tables in spec/sw-architecture.md and of the
// "not yet implemented" list in spec/test-strategy.md.

export type Priority = "Must" | "Should" | "Could";

export interface Requirement {
  id: string;
  prefix: string;
  /** Text of the requirement, as written in the table. */
  text: string;
  /** null for withdrawn requirements (priority "–"). */
  priority: Priority | null;
  withdrawn: boolean;
  line: number;
}

export interface ParseResult<T> {
  value: T;
  errors: string[];
}

const ID = String.raw`[A-Z]{2,4}-\d{2}`;
const ID_PATTERN = new RegExp(`^${ID}$`);
const REQUIREMENT_ROW = new RegExp(String.raw`^\|\s*(${ID})\s*\|(.*)\|\s*([^|]*?)\s*\|\s*$`);
const PRIORITIES: readonly string[] = ["Must", "Should", "Could"];
const WITHDRAWN_MARKERS: readonly string[] = ["–", "-", "—"];

export function isRequirementId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function prefixOf(id: string): string {
  return id.slice(0, id.indexOf("-"));
}

/** Reads every requirement row (`| ABC-01 | text | Prio |`) of the architecture spec. */
export function parseRequirements(markdown: string): ParseResult<Requirement[]> {
  const requirements: Requirement[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  markdown.split("\n").forEach((rawLine, index) => {
    const match = REQUIREMENT_ROW.exec(rawLine.trimEnd());
    if (!match) return;
    const [, id = "", text = "", prio = ""] = match;
    const line = index + 1;

    const previous = seen.get(id);
    if (previous !== undefined) {
      errors.push(
        `sw-architecture.md:${line}: duplicate requirement ID ${id} (first on line ${previous})`,
      );
      return;
    }
    seen.set(id, line);

    const withdrawn = WITHDRAWN_MARKERS.includes(prio);
    if (!withdrawn && !PRIORITIES.includes(prio)) {
      errors.push(`sw-architecture.md:${line}: ${id} has unknown priority "${prio}"`);
      return;
    }
    requirements.push({
      id,
      prefix: prefixOf(id),
      text: text.trim(),
      priority: withdrawn ? null : (prio as Priority),
      withdrawn,
      line,
    });
  });

  return { value: requirements, errors };
}

/**
 * Expands an ID list such as "PRES-01, PRES-02, PRES-04 – PRES-10" into single IDs.
 * Ranges use an en dash (or a hyphen) surrounded by spaces.
 */
export function expandIdList(list: string): ParseResult<string[]> {
  const ids: string[] = [];
  const errors: string[] = [];

  for (const rawItem of list.split(",")) {
    const item = rawItem.trim();
    if (item === "") continue;
    const parts = item.split(/\s+[–-]\s+/).map((part) => part.trim());

    if (parts.length === 1 && isRequirementId(item)) {
      ids.push(item);
      continue;
    }
    const [from, to] = parts;
    if (parts.length !== 2 || !from || !to || !isRequirementId(from) || !isRequirementId(to)) {
      errors.push(`cannot read "${item}" (expected an ID like ABC-01 or a range ABC-01 – ABC-05)`);
      continue;
    }
    if (prefixOf(from) !== prefixOf(to)) {
      errors.push(`range "${item}" mixes prefixes`);
      continue;
    }
    const start = Number(from.slice(-2));
    const end = Number(to.slice(-2));
    if (end < start) {
      errors.push(`range "${item}" runs backwards`);
      continue;
    }
    for (let n = start; n <= end; n++) {
      ids.push(`${prefixOf(from)}-${String(n).padStart(2, "0")}`);
    }
  }
  return { value: ids, errors };
}

export interface NotImplementedList {
  ids: Set<string>;
  /** Total stated in the table's "Total" row, if present. */
  statedTotal: number | null;
}

/**
 * Reads the table in the "Not yet implemented" section of test-strategy.md:
 * `| Prefix | IDs | Count |`, followed by a `| **Total** | | **n** |` row.
 * Checks that every row's count matches its expanded IDs, and the total.
 */
export function parseNotImplemented(markdown: string): ParseResult<NotImplementedList> {
  const errors: string[] = [];
  const ids = new Set<string>();
  let statedTotal: number | null = null;

  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => /^##\s+(\d+\.\s+)?Not yet implemented\s*$/i.test(line));
  if (start === -1) {
    return {
      value: { ids, statedTotal },
      errors: ['test-strategy.md: section "Not yet implemented" not found'],
    };
  }

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^##\s/.test(line)) break;
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const [prefix = "", list = "", count = ""] = cells;
    if (prefix === "Prefix" || /^-+$/.test(prefix.replaceAll(":", ""))) continue;

    const where = `test-strategy.md:${i + 1}`;
    if (/total/i.test(prefix)) {
      statedTotal = Number(count.replaceAll("*", ""));
      continue;
    }

    const expanded = expandIdList(list);
    errors.push(...expanded.errors.map((error) => `${where}: ${error}`));
    for (const id of expanded.value) {
      if (prefixOf(id) !== prefix) {
        errors.push(`${where}: ${id} is listed in the row of prefix ${prefix}`);
      }
      if (ids.has(id)) errors.push(`${where}: ${id} is listed twice`);
      ids.add(id);
    }
    if (Number(count) !== expanded.value.length) {
      errors.push(
        `${where}: row ${prefix} states count ${count} but lists ${expanded.value.length} IDs`,
      );
    }
  }

  if (statedTotal !== null && statedTotal !== ids.size) {
    errors.push(`test-strategy.md: total states ${statedTotal} but the rows list ${ids.size} IDs`);
  }
  return { value: { ids, statedTotal }, errors };
}

export interface Epic {
  /** The epic's number, e.g. 6, or 3.5 for an epic inserted between 3 and 4. */
  number: number;
  title: string;
  ids: string[];
}

/**
 * Reads one epic file of spec/backlog/epics/: the `# Epic <n> – <title>`
 * heading and the IDs on the `Requirements:` lines of its `## Stories`
 * section. The refinement and the report of the epic do not count.
 */
export function parseEpic(markdown: string): Epic | undefined {
  let epic: Epic | undefined;
  let inStories = false;

  for (const line of markdown.split("\n")) {
    const heading = /^#\s+Epic\s+(\d+(?:\.\d+)?)\s+[–-]\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (epic) break;
      epic = { number: Number(heading[1]), title: heading[2] ?? "", ids: [] };
      continue;
    }
    if (/^##\s/.test(line)) inStories = /^##\s+Stories\s*$/.test(line);
    if (epic && inStories && line.startsWith("Requirements:")) {
      epic.ids.push(...(line.match(new RegExp(ID, "g")) ?? []));
    }
  }
  return epic;
}

/** Parses every epic file and returns the epics in the order of their numbers. */
export function parseEpics(files: { name: string; markdown: string }[]): ParseResult<Epic[]> {
  const epics: Epic[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const epic = parseEpic(file.markdown);
    if (epic) epics.push(epic);
    else errors.push(`${file.name}: no "# Epic <n> – <title>" heading`);
  }
  epics.sort((a, b) => a.number - b.number);
  for (let i = 1; i < epics.length; i++) {
    const epic = epics[i];
    if (epic && epic.number === epics[i - 1]?.number) {
      errors.push(`backlog: epic ${epic.number} has more than one file`);
    }
  }
  return { value: epics, errors };
}

/** The statuses of an epic (spec/backlog/roadmap.md, "Status of an epic"). */
export const EPIC_STATUSES = ["open", "refined", "ready", "in progress", "done", "dropped"];

export interface EpicHeader {
  status: string;
  /** The epics that must be done before this one can be ready. */
  dependsOn: number[];
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function epicNumbers(cell: string): number[] {
  return (cell.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/**
 * Reads the header table of an epic file: the row after
 * `| Status | Release | Depends on | Branch |` and its separator.
 */
export function parseEpicHeader(markdown: string): EpicHeader | undefined {
  const lines = markdown.split("\n");
  const at = lines.findIndex((line) =>
    /^\|\s*Status\s*\|\s*Release\s*\|\s*Depends on\s*\|/.test(line),
  );
  const row = at >= 0 ? lines[at + 2] : undefined;
  if (!row?.startsWith("|")) return undefined;
  const [status = "", , dependsOn = ""] = cells(row);
  return { status, dependsOn: epicNumbers(dependsOn) };
}

export interface RoadmapEpic extends EpicHeader {
  number: number;
}

/** Reads the epic rows of the roadmap table: `| [<n>](epics/…) | content | depends on | status |`. */
export function parseRoadmap(markdown: string): RoadmapEpic[] {
  const epics: RoadmapEpic[] = [];
  for (const line of markdown.split("\n")) {
    const link = /^\|\s*\[(\d+(?:\.\d+)?)\]\(epics\//.exec(line);
    if (!link) continue;
    const row = cells(line);
    epics.push({
      number: Number(link[1]),
      status: row[3] ?? "",
      dependsOn: epicNumbers(row[2] ?? ""),
    });
  }
  return epics;
}

/**
 * Checks the statuses and dependencies of the epics: known statuses and
 * dependencies, an epic that is ready, in progress or done has all its
 * dependencies done, and the roadmap agrees with the epic files.
 */
export function checkEpicStatuses(
  epics: (EpicHeader & { number: number })[],
  roadmap: RoadmapEpic[],
): string[] {
  const errors: string[] = [];
  const byNumber = new Map(epics.map((epic) => [epic.number, epic]));
  const same = (a: number[], b: number[]) => a.join(",") === b.join(",");

  for (const epic of epics) {
    if (!EPIC_STATUSES.includes(epic.status)) {
      errors.push(`epic ${epic.number}: unknown status "${epic.status}"`);
    }
    for (const dependency of epic.dependsOn) {
      const other = byNumber.get(dependency);
      if (!other) {
        errors.push(`epic ${epic.number}: depends on epic ${dependency}, which does not exist`);
      } else if (
        ["ready", "in progress", "done"].includes(epic.status) &&
        other.status !== "done"
      ) {
        errors.push(
          `epic ${epic.number} is ${epic.status}, but epic ${dependency} it depends on is ${other.status}`,
        );
      }
    }
    const row = roadmap.find((r) => r.number === epic.number);
    if (!row) {
      errors.push(`roadmap.md: epic ${epic.number} is missing`);
    } else {
      if (row.status !== epic.status) {
        errors.push(
          `roadmap.md: epic ${epic.number} is ${row.status}, but its file says ${epic.status}`,
        );
      }
      if (!same(row.dependsOn, epic.dependsOn)) {
        errors.push(`roadmap.md: epic ${epic.number} has other dependencies than its file`);
      }
    }
  }
  for (const row of roadmap) {
    if (!byNumber.has(row.number)) errors.push(`roadmap.md: epic ${row.number} has no file`);
  }
  return errors;
}
