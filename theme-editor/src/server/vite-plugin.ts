import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { THEME_LIMITS } from "@zappaloo/shared";
import { FontRefused, prepareFont } from "./font.ts";
import { buildPackage, openPackage } from "./package.ts";
import type { PackageData } from "../transfer.ts";

/** An uploaded font before conversion may be larger than the 2 MB it must have after it. */
const UPLOAD_LIMIT = 16 * THEME_LIMITS.fontBytes;

const API = "/__theme-editor/api";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > limit) return undefined;
    chunks.push(data);
  }
  return Buffer.concat(chunks, length);
}

/** The parts of the editor that need Node: converting fonts now, building and opening packages later. */
export function themeEditorServer(): Plugin {
  return {
    name: "zappaloo-theme-editor-server",
    configureServer(server) {
      server.middlewares.use(API, (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (request.method === "GET" && url.pathname === "/health") {
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "POST" && url.pathname === "/font") {
          void convertFont(request, response, url.searchParams.get("name") ?? "font");
          return;
        }
        if (request.method === "POST" && url.pathname === "/export") {
          void exportTheme(request, response);
          return;
        }
        if (request.method === "POST" && url.pathname === "/open") {
          void openTheme(request, response);
          return;
        }
        next();
      });
    },
  };
}

async function convertFont(
  request: IncomingMessage,
  response: ServerResponse,
  name: string,
): Promise<void> {
  try {
    const body = await readBody(request, UPLOAD_LIMIT);
    if (body === undefined) {
      sendJson(response, 413, { message: "The font file is larger than 32 MB", findings: [] });
      return;
    }
    const font = await prepareFont(name, body);
    sendJson(response, 200, {
      fileName: font.fileName,
      converted: font.converted,
      suggestion: font.suggestion,
      size: font.woff2.length,
      woff2: font.woff2.toString("base64"),
    });
  } catch (error) {
    if (error instanceof FontRefused) {
      sendJson(response, 422, { message: error.message, findings: error.findings });
      return;
    }
    sendJson(response, 500, { message: "The font could not be read", findings: [] });
  }
}

/** A package with its fonts and icons is at most 8 fonts of 2 MB and four icons, as base64 in JSON. */
const EXPORT_LIMIT = 64 * 1024 * 1024;

async function exportTheme(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readBody(request, EXPORT_LIMIT);
    if (body === undefined) {
      sendJson(response, 413, { message: "The theme is too large", findings: [] });
      return;
    }
    const built = buildPackage(JSON.parse(body.toString("utf8")) as PackageData);
    if (!built.ok) {
      sendJson(response, 422, {
        message: "The validator refuses the package",
        findings: built.findings,
      });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${built.fileName}"`,
      "X-File-Name": built.fileName,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(built.archive);
  } catch {
    sendJson(response, 400, { message: "The theme could not be exported", findings: [] });
  }
}

async function openTheme(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readBody(request, THEME_LIMITS.archiveBytes);
    if (body === undefined) {
      sendJson(response, 422, {
        message: "The package is larger than 10 MB",
        findings: [{ file: "(archive)", code: "archive_too_large", detail: "larger than 10 MB" }],
      });
      return;
    }
    const opened = openPackage(body);
    if (!opened.ok) {
      sendJson(response, 422, {
        message: "The validator refuses the package",
        findings: opened.findings,
      });
      return;
    }
    sendJson(response, 200, { data: opened.data });
  } catch {
    sendJson(response, 400, { message: "The package could not be opened", findings: [] });
  }
}
