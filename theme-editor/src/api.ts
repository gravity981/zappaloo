import type { DraftFontFile } from "./model.ts";

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

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
