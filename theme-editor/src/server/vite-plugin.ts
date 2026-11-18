import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { THEME_LIMITS } from "@zappaloo/shared";
import { FontRefused, prepareFont } from "./font.ts";

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
