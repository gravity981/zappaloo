import { fromBase64 } from "./base64.ts";
import type { DraftFontFile } from "./model.ts";
import type { PackageData, PackageFinding } from "./transfer.ts";

export interface FontFinding {
  file: string;
  code: string;
  detail: string;
}

/** A font the server could not use, with the validator's findings. */
export class FontError extends Error {
  readonly findings: FontFinding[];
  constructor(message: string, findings: FontFinding[]) {
    super(message);
    this.findings = findings;
  }
}

export interface ConvertedFont {
  file: Omit<DraftFontFile, "id" | "weight" | "style">;
  suggestion: { family: string; weight: number; style: "normal" | "italic" };
}

/** Sends a WOFF2, OTF or TTF file to the development server and gets WOFF2 back (THM-09). */
export async function convertFont(file: File): Promise<ConvertedFont> {
  const response = await fetch(`/__theme-editor/api/font?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: await file.arrayBuffer(),
  });
  const body = (await response.json()) as {
    message?: string;
    findings?: FontFinding[];
    fileName?: string;
    converted?: boolean;
    size?: number;
    woff2?: string;
    suggestion?: ConvertedFont["suggestion"];
  };
  if (
    !response.ok ||
    body.woff2 === undefined ||
    body.fileName === undefined ||
    body.suggestion === undefined
  ) {
    throw new FontError(body.message ?? "The font could not be read", body.findings ?? []);
  }
  return {
    file: {
      fileName: body.fileName,
      converted: body.converted === true,
      size: body.size ?? 0,
      woff2: fromBase64(body.woff2),
    },
    suggestion: body.suggestion,
  };
}

const API = "/__theme-editor/api";

export type ExportResult =
  | { ok: true; fileName: string; blob: Blob }
  | { ok: false; findings: PackageFinding[]; message: string };

export type OpenResult =
  { ok: true; data: PackageData } | { ok: false; findings: PackageFinding[]; message: string };

async function failure(
  response: Response,
): Promise<{ findings: PackageFinding[]; message: string }> {
  try {
    const body = (await response.json()) as { findings?: PackageFinding[]; message?: string };
    return {
      findings: body.findings ?? [],
      message: body.message ?? "The server refused the request",
    };
  } catch {
    return { findings: [], message: "The development server did not answer" };
  }
}

/** Builds the package on the development server with the platform's code, and returns the archive (THM-12). */
export async function exportPackage(data: PackageData): Promise<ExportResult> {
  const response = await fetch(`${API}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) return { ok: false, ...(await failure(response)) };
  return {
    ok: true,
    fileName: response.headers.get("X-File-Name") ?? "theme.tar.gz",
    blob: await response.blob(),
  };
}

/** Sends a package to the development server, which validates it and reads it back (THM-13). */
export async function openPackage(file: File): Promise<OpenResult> {
  const response = await fetch(`${API}/open`, { method: "POST", body: await file.arrayBuffer() });
  if (!response.ok) return { ok: false, ...(await failure(response)) };
  const body = (await response.json()) as { data: PackageData };
  return { ok: true, data: body.data };
}
