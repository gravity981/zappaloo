// The requirement report as one self-contained HTML page: a result tree (epic → requirement →
// tests) in which everything starts collapsed, and a short Markdown summary for the page of a
// GitHub Actions run, which cannot show the whole page.
import { progressByEpic } from "./report.ts";
import type { Report, RequirementRow, RequirementStatus } from "./report.ts";
import type { TestCase } from "./results.ts";

const STATUS_LABEL: Record<RequirementStatus, string> = {
  passed: "pass",
  failed: "FAIL",
  untested: "no test",
};

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STYLE = `
:root { --bg: #fafaf8; --fg: #1d1d1b; --muted: #6a6a66; --line: #dcdcd6; --card: #fff;
  --ok: #1a7f37; --bad: #c62828; --warn: #9a6700; --none: #6a6a66; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #161615; --fg: #ececea; --muted: #a0a09a; --line: #3a3a37; --card: #1f1f1e;
    --ok: #4cc26b; --bad: #ff7b72; --warn: #e3b341; --none: #a0a09a; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg);
  font: 14px/1.5 system-ui, sans-serif; max-width: 1100px; margin-inline: auto; }
h1 { font-size: 22px; margin: 0 0 8px; }
.result { font-weight: 700; padding: 6px 10px; border-radius: 6px; display: inline-block; }
.result.ok { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
.result.failed { background: color-mix(in srgb, var(--bad) 18%, transparent); color: var(--bad); }
ul.totals { margin: 12px 0; padding-left: 18px; color: var(--muted); }
.bar { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
button { font: inherit; padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--card); color: var(--fg); cursor: pointer; }
details { border: 1px solid var(--line); border-radius: 8px; background: var(--card);
  margin: 6px 0; }
details details { margin: 4px 8px; }
summary { cursor: pointer; padding: 6px 10px; display: flex; gap: 8px; align-items: baseline;
  flex-wrap: wrap; }
.body { padding: 2px 12px 10px 28px; }
.id { font-weight: 700; font-family: ui-monospace, monospace; }
.prio, .meta { color: var(--muted); font-size: 12.5px; }
.grow { flex: 1; min-width: 12ch; }
.badge { font-size: 12px; font-weight: 600; padding: 0 8px; border-radius: 10px; border: 1px solid; }
.badge.pass { color: var(--ok); } .badge.failed { color: var(--bad); }
.badge.untested { color: var(--none); } .badge.warn { color: var(--warn); }
ul.tests { list-style: none; margin: 6px 0 0; padding: 0; }
ul.tests li { padding: 2px 0; word-break: break-word; }
.t-passed { color: var(--ok); } .t-failed { color: var(--bad); } .t-skipped { color: var(--none); }
.runner { font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); }
ul.problems { margin: 4px 0 8px; padding-left: 28px; }
footer { margin-top: 24px; color: var(--muted); font-size: 12.5px; }
`;

const SCRIPT = `
for (const button of document.querySelectorAll("button[data-all]")) {
  button.addEventListener("click", () => {
    const open = button.dataset.all === "open";
    for (const node of document.querySelectorAll("details.tree")) node.open = open;
  });
}
`;

const symbol = (status: TestCase["status"]): string =>
  status === "passed" ? "✓" : status === "failed" ? "✗" : "–";

function testItem(test: TestCase): string {
  const where = [test.runner, test.project].filter(Boolean).join(" / ");
  return `<li class="t-${test.status}">${symbol(test.status)} <span class="runner">${escapeHtml(where)}</span> ${escapeHtml(test.title)}</li>`;
}

function requirementNode(row: RequirementRow): string {
  const status = row.status;
  const tests =
    row.tests.length === 0
      ? '<p class="meta">No test names this requirement.</p>'
      : `<ul class="tests">${row.tests.map(testItem).join("")}</ul>`;
  return `<details class="tree"><summary><span class="id">${escapeHtml(row.id)}</span> <span class="prio">${escapeHtml(row.priority)}</span> <span class="badge ${status}">${STATUS_LABEL[status]}</span>${row.implemented ? "" : ' <span class="badge warn">not yet implemented</span>'}<span class="grow meta">${escapeHtml(row.text)}</span></summary><div class="body"><p>${escapeHtml(row.text)}</p>${tests}</div></details>`;
}

function problems(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `<details class="tree"><summary><b>${title} (${String(items.length)})</b></summary><ul class="problems">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`;
}

/** The whole report as an HTML page; every node of the tree is collapsed. */
export function renderHtml(report: Report, generatedAt: Date = new Date()): string {
  const { totals } = report;
  const failed = report.errors.length > 0;
  const epics = progressByEpic(report)
    .map((progress) => {
      const rows = report.rows.filter((row) => row.epic === progress.epic);
      const bad = rows.filter((row) => row.status === "failed").length;
      const label =
        progress.epic === null ? "Not planned in an epic" : `Epic ${String(progress.epic)}`;
      return `<details class="tree"><summary><b>${escapeHtml(label)}</b> <span class="grow">${escapeHtml(progress.title)}</span><span class="meta">${String(progress.implemented)} of ${String(progress.planned)} implemented</span>${bad > 0 ? ` <span class="badge failed">${String(bad)} failing</span>` : ""}</summary><div class="body">${rows.map(requirementNode).join("") || '<p class="meta">No requirements.</p>'}</div></details>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Requirement report</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Requirement report</h1>
<p class="result ${failed ? "failed" : "ok"}">${failed ? `FAILED (${String(report.errors.length)} error(s))` : "OK"}</p>
<ul class="totals">
<li>Requirements: ${String(totals.ids)} IDs, ${String(totals.active)} active, ${String(totals.withdrawn)} withdrawn</li>
<li>Implemented: ${String(totals.implemented)} of ${String(totals.active)} active, ${String(totals.implementedPassing)} with passing tests; ${String(totals.notImplemented)} not yet implemented</li>
${totals.tests.map((t) => `<li>${escapeHtml(t.runner)}: ${String(t.total)} test result(s), ${String(t.tagged)} tagged with requirement IDs</li>`).join("\n")}
</ul>
<div class="bar"><button type="button" data-all="open">Expand all</button><button type="button" data-all="close">Collapse all</button></div>
${problems("Errors", report.errors)}
${problems("Warnings", report.warnings)}
<h2>Result tree</h2>
${epics}
<footer>Generated ${escapeHtml(generatedAt.toISOString())} from the spec and the JSON results of the test runs.</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/**
 * A short summary for the page of a GitHub Actions run (Markdown): the result, the totals, the
 * epics, the first problems, and where the full report is.
 */
export function renderSummaryMarkdown(report: Report, artifactName: string): string {
  const { totals } = report;
  const out: string[] = ["## Requirement report", ""];
  out.push(
    `**Result:** ${report.errors.length === 0 ? "OK" : `FAILED (${String(report.errors.length)} error(s))`}`,
    "",
    `- Implemented: ${String(totals.implemented)} of ${String(totals.active)} active requirements, ${String(totals.implementedPassing)} with passing tests; ${String(totals.notImplemented)} not yet implemented`,
    "",
    "| Epic | Title | Implemented | Remaining |",
    "|---|---|---|---|",
  );
  for (const p of progressByEpic(report)) {
    out.push(
      `| ${p.epic === null ? "–" : String(p.epic)} | ${p.title} | ${String(p.implemented)} of ${String(p.planned)} | ${String(p.remaining)} |`,
    );
  }
  const shown = 10;
  const list = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    out.push("", `**${title} (${String(items.length)}):**`, "");
    out.push(...items.slice(0, shown).map((item) => `- ${item}`));
    if (items.length > shown) out.push(`- … and ${String(items.length - shown)} more`);
  };
  list("Errors", report.errors);
  list("Warnings", report.warnings);
  out.push(
    "",
    `The full report with the result tree (everything collapsed, open it in a browser) is the file \`requirements.html\` in the artifact **${artifactName}** of this run. Download it from the "Artifacts" section below.`,
    "",
  );
  return out.join("\n");
}
