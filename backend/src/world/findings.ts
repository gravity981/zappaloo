// The findings of the world validator (sw-architecture.md 14.4). Every finding names its file, the map
// object where there is one, and the reason. Errors refuse the package; warnings are listed only.
import type { z } from "zod";

export type WorldFindingSeverity = "error" | "warning";

import type { WorldFindingCode } from "@zappaloo/shared";
export type { WorldFindingCode };

export interface WorldFinding {
  /** The file of the package the finding is about. */
  file: string;
  /** The map object (its name, or its layer), where there is one. */
  object?: string;
  code: WorldFindingCode;
  severity: WorldFindingSeverity;
  /** The reason in words, for the admin and the maker. */
  detail: string;
}

export function errorFinding(
  file: string,
  code: WorldFindingCode,
  detail: string,
  object?: string,
): WorldFinding {
  return object === undefined
    ? { file, code, severity: "error", detail }
    : { file, object, code, severity: "error", detail };
}

export function warningFinding(
  file: string,
  code: WorldFindingCode,
  detail: string,
  object?: string,
): WorldFinding {
  return object === undefined
    ? { file, code, severity: "warning", detail }
    : { file, object, code, severity: "warning", detail };
}

/** The issues of a Zod error as "path: reason", the field first. */
export function zodDetail(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(file)"}: ${issue.message}`)
    .join("; ");
}
