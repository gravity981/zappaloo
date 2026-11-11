// npm run mocks
//
// Serves the UX mocks in spec/mocks/ unchanged on http://localhost:5174 (or
// MOCKS_PORT). A plain static server: no injected client, no open connection,
// so VS Code's Simple Browser finishes loading. Reload the page after a change.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../spec/mocks/", import.meta.url));
const port = Number(process.env.MOCKS_PORT ?? 5174);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const file = normalize(join(dir, path === "/" ? "zappaloo-mocks.html" : path));
  if (!file.startsWith(dir) || file.includes(`${sep}..${sep}`)) {
    res.writeHead(403).end();
    return;
  }
  readFile(file).then(
    (body) => {
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    },
    () => res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"),
  );
}).listen(port, () => {
  console.log(`UX mocks: http://localhost:${port}/zappaloo-mocks.html`);
});
