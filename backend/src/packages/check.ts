// Checks any package file with the platform's validator: the kind comes from `manifest.json`, so the
// same command checks a theme and a world package (`zappaloo validate`, sw-architecture.md 23.8). It
// reads no database and no data folder.
import { PACKAGE_DEFINITIONS, THEME_KIND, WORLD_KIND, WORLD_LIMITS } from "@zappaloo/shared";
import type { PackageDefinition } from "@zappaloo/shared";
import { checkThemePackage } from "../theme/validate.ts";
import { checkWorldPackage } from "../world/validate.ts";
import type { WorldFindingSeverity } from "../world/findings.ts";
import { readPackageArchive, TarError } from "./archive.ts";

export type PackageKind = "theme" | "world";

/** The rule of the definition that a finding code belongs to, for each package format version read. */
export function ruleIdsOf(definition: PackageDefinition<string>): Map<string, string> {
  const ids = new Map<string, string>();
  for (const rule of definition.rules) {
    for (const code of rule.codes) ids.set(code, rule.id);
  }
  return ids;
}

const RULE_IDS: Record<PackageKind, Map<string, string>> = {
  theme: ruleIdsOf(PACKAGE_DEFINITIONS.theme[1]),
  world: ruleIdsOf(PACKAGE_DEFINITIONS.world[1]),
};

/** Adds the rule id of each finding (its code in the definition of the package's kind). */
function withRules(kind: PackageKind, findings: PackageFinding[]): PackageFinding[] {
  return findings.map((finding) => {
    const rule = RULE_IDS[kind].get(finding.code);
    return rule === undefined ? finding : { ...finding, rule };
  });
}

/** One finding of any package, theme or world: the file, the object where there is one, the reason. */
export interface PackageFinding {
  file: string;
  object?: string;
  code: string;
  /** The rule of the package definition the code belongs to (e.g. `archive.size`). */
  rule?: string;
  severity: WorldFindingSeverity;
  detail: string;
}

/** The result of checking a file: whether the platform accepts it, and every finding. */
export interface PackageReport {
  ok: boolean;
  /** The kind of the package, when `manifest.json` names one. */
  kind?: PackageKind;
  findings: PackageFinding[];
}

/** The kind a package names in its `manifest.json`, read without validating anything else. */
function kindOf(archive: Buffer): PackageKind | PackageFinding {
  const entries = readPackageArchive(archive, { unpackedBytes: WORLD_LIMITS.unpackedBytes });
  const manifest = entries.find((entry) => entry.kind === "file" && entry.path === "manifest.json");
  if (manifest === undefined) {
    return {
      file: "manifest.json",
      code: "file_missing",
      severity: "error",
      detail: "the file is missing",
    };
  }
  let kind: unknown;
  try {
    kind = (JSON.parse(manifest.data.toString("utf8")) as { kind?: unknown }).kind;
  } catch {
    return {
      file: "manifest.json",
      code: "json_invalid",
      severity: "error",
      detail: "not valid JSON",
    };
  }
  if (kind === THEME_KIND) return "theme";
  if (kind === WORLD_KIND) return "world";
  return {
    file: "manifest.json",
    code: "json_field",
    severity: "error",
    detail: `kind is ${JSON.stringify(kind)}; a package is ${THEME_KIND} or ${WORLD_KIND}`,
  };
}

/** Checks a whole package file, theme or world. */
export function checkPackage(archive: Buffer): PackageReport {
  if (archive.length > WORLD_LIMITS.archiveBytes) {
    return {
      ok: false,
      findings: [
        {
          file: "(archive)",
          code: "archive_too_large",
          severity: "error",
          detail: "larger than 40 MB",
        },
      ],
    };
  }
  let kind: PackageKind | PackageFinding;
  try {
    kind = kindOf(archive);
  } catch (error) {
    if (error instanceof TarError) {
      return {
        ok: false,
        findings: [
          { file: error.file, code: error.code, severity: "error", detail: error.message },
        ],
      };
    }
    throw error;
  }
  if (typeof kind !== "string") return { ok: false, findings: [kind] };

  if (kind === "theme") {
    const check = checkThemePackage(archive);
    const findings: PackageFinding[] = check.ok
      ? []
      : check.findings.map((finding) => ({ ...finding, severity: "error" as const }));
    return { ok: check.ok, kind, findings: withRules(kind, findings) };
  }
  const check = checkWorldPackage(archive);
  return { ok: check.ok, kind, findings: withRules(kind, check.findings) };
}
