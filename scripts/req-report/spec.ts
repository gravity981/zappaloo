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

export interface Stage {
  number: number;
  title: string;
  ids: string[];
}

/**
 * Reads the stages of implementation-plan.md: each `### Stage <n> – <title>`
 * heading and the IDs on its `Requirements:` lines. Only the section with the
 * stages counts: the status reports further down repeat the headings.
 */
export function parseStages(markdown: string): Stage[] {
  const stages: Stage[] = [];
  let current: Stage | undefined;
  let finished = false;

  for (const line of markdown.split("\n")) {
    if (finished) break;
    const heading = /^###\s+Stage\s+(\d+)\s+[–-]\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { number: Number(heading[1]), title: heading[2] ?? "", ids: [] };
      stages.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = undefined;
      // The first section after the stages ends them.
      finished = stages.length > 0;
    }
    if (current && line.startsWith("Requirements:")) {
      current.ids.push(...(line.match(new RegExp(ID, "g")) ?? []));
    }
  }
  return stages;
}
