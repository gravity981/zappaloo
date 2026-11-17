import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { WORLD_LIMITS } from "@zappaloo/shared";
import { PreviewPackageStore } from "./package-store.ts";

const API_PREFIX = "/__game-preview/api";

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readArchive(request: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > WORLD_LIMITS.archiveBytes) {
    throw new RequestError(
      413,
      `Package is larger than ${String(WORLD_LIMITS.archiveBytes)} bytes`,
    );
  }

  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > WORLD_LIMITS.archiveBytes) {
      throw new RequestError(
        413,
        `Package is larger than ${String(WORLD_LIMITS.archiveBytes)} bytes`,
      );
    }
    chunks.push(data);
  }
  return Buffer.concat(chunks, length);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: PreviewPackageStore,
): Promise<void> {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const method = request.method ?? "GET";

  if (pathname === `${API_PREFIX}/health` && method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (pathname === `${API_PREFIX}/packages` && method === "POST") {
    const upload = store.upload(await readArchive(request));
    if (!upload.ok) {
      sendJson(response, 422, { findings: upload.findings });
      return;
    }
    sendJson(response, 201, upload.preview);
    return;
  }

  const packagePrefix = `${API_PREFIX}/packages/`;
  if (!pathname.startsWith(packagePrefix)) {
    sendJson(response, 404, { error: "Preview endpoint not found" });
    return;
  }
  const remainder = pathname.slice(packagePrefix.length);
  const fileMatch = /^([0-9a-f-]+)\/files\/(.+)$/i.exec(remainder);
  if (fileMatch !== null && method === "GET") {
    const [, token, encodedPath] = fileMatch;
    if (token === undefined || encodedPath === undefined) {
      sendJson(response, 404, { error: "Preview package not found" });
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
      sendJson(response, 400, { error: "Invalid package file path" });
      return;
    }
    const file = store.file(token, path);
    if (file === undefined) {
      sendJson(response, 404, { error: "Preview package file not found" });
      return;
    }
    const contentType = path.endsWith(".json")
      ? "application/json; charset=utf-8"
      : path.endsWith(".png")
        ? "image/png"
        : "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file);
    return;
  }

  const tokenMatch = /^([0-9a-f-]+)$/i.exec(remainder);
  if (tokenMatch !== null && method === "DELETE") {
    const token = tokenMatch[1];
    if (token === undefined || !store.delete(token)) {
      sendJson(response, 404, { error: "Preview package not found" });
      return;
    }
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  sendJson(response, 404, { error: "Preview endpoint not found" });
}

export function worldPreviewServer(): Plugin {
  const store = new PreviewPackageStore();
  return {
    name: "zappaloo-game-preview-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith(API_PREFIX)) {
          next();
          return;
        }
        void handleRequest(request, response, store).catch((error: unknown) => {
          if (error instanceof RequestError) {
            sendJson(response, error.status, { error: error.message });
            return;
          }
          console.error("Game preview request failed", error);
          if (!response.headersSent) {
            sendJson(response, 500, { error: "The preview server could not process the request" });
          } else {
            response.destroy(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
      server.httpServer?.once("close", () => {
        store.clear();
      });
    },
  };
}
