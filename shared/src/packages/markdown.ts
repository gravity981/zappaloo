// Renders a package definition as a Markdown document (the documents attached to every release).
// The output is a pure function of the definition: the test in scripts/schemas checks the committed
// files against it, so the documents cannot drift from the validator.
import type { PackageDefinition, RuleDefinition } from "./definition.ts";

const GENERATED =
  "<!-- Generated from the package definition in shared/src/packages by `npm run schemas`. Do not edit by hand. -->";

function row(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function rulesTable<Code extends string>(rules: RuleDefinition<Code>[]): string[] {
  return [
    row(["Rule", "Severity", "Requirements", "What is checked", "Findings"]),
    row(["---", "---", "---", "---", "---"]),
    ...rules.map((rule) =>
      row([
        `\`${rule.id}\``,
        rule.severity === "error" ? "error (refuses)" : "warning",
        rule.requirements.join(", "),
        rule.text,
        rule.codes.map((code) => `\`${code}\``).join(", "),
      ]),
    ),
  ];
}

/** The Markdown document of one format version. */
export function renderPackageDocument<Code extends string>(
  definition: PackageDefinition<Code>,
): string {
  const validatorRules = definition.rules.filter((rule) => rule.scope === "validator");
  const importRules = definition.rules.filter((rule) => rule.scope === "installation");
  const lines: string[] = [
    GENERATED,
    "",
    `# ${definition.title}, format version ${String(definition.formatVersion)}`,
    "",
    definition.summary,
    "",
    `The package names its kind and format version in \`manifest.json\`: \`"kind": "${definition.kind}"\`, \`"formatVersion": ${String(definition.formatVersion)}\`.`,
    "",
    "## Limits",
    "",
    row(["Limit", "Value", "Requirement"]),
    row(["---", "---", "---"]),
    ...definition.limits.map((limit) => row([limit.label, limit.value, limit.requirement])),
    "",
    "## Layout",
    "",
    "The files sit at the root of the archive, without a wrapping folder. Placeholders in braces are names chosen by the maker.",
    "",
    row(["Path", "Kind", "Required", "Repeats", "Size", "Purpose", "Schema"]),
    row(["---", "---", "---", "---", "---", "---", "---"]),
    ...definition.layout.map((entry) =>
      row([
        `\`${entry.path}${entry.kind === "folder" ? "/" : ""}\``,
        entry.kind,
        entry.required ? "yes" : "no",
        entry.many ? "any number" : "once",
        entry.size
          ? `${String(entry.size.width)} × ${String(entry.size.height)} pixels`
          : (entry.sizeNote ?? ""),
        entry.purpose,
        entry.schemaFile ? `\`${entry.schemaFile}\`` : "",
      ]),
    ),
    "",
    "## Rules checked by the validator",
    "",
    "A package with an error is refused, and the active package stays as it is. Warnings are listed and do not refuse. The command `zappaloo validate <file>` runs these rules outside the platform, with `--json` for the findings and their rule ids.",
    "",
    ...rulesTable(validatorRules),
  ];
  if (importRules.length > 0) {
    lines.push(
      "",
      "## Rules checked at import",
      "",
      "These depend on the installation, so the validator outside the platform does not check them.",
      "",
      ...rulesTable(importRules),
    );
  }
  lines.push(
    "",
    "## Changes",
    "",
    ...definition.changes.map((change) => `- ${change.date}: ${change.text}`),
    "",
  );
  return lines.join("\n");
}
