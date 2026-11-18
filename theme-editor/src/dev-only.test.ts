import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../vite.config.ts";

const editorDir = path.resolve(import.meta.dirname, "..");
const root = path.resolve(editorDir, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

type ConfigFn = (env: { command: "build" | "serve"; mode: string }) => {
  server: { host: string; port: number };
};
const resolveConfig = config as unknown as ConfigFn;

/** Files that the tracked source of a workspace consists of. */
function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|json|html|css)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !file.includes("node_modules"));
}

describe("the theme package editor is a development-only tool (THM-08)", () => {
  it("[THM-08] the dev server refuses to start without APP_ENV=dev", () => {
    const before = process.env.APP_ENV;
    try {
      delete process.env.APP_ENV;
      expect(() => resolveConfig({ command: "serve", mode: "development" })).toThrow(/APP_ENV=dev/);
      process.env.APP_ENV = "production";
      expect(() => resolveConfig({ command: "serve", mode: "development" })).toThrow(/APP_ENV=dev/);
    } finally {
      if (before === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = before;
    }
  });

  it("[THM-08] the dev server listens on 127.0.0.1, port 5176", () => {
    const before = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "dev";
      const resolved = resolveConfig({ command: "serve", mode: "development" });
      expect(resolved.server.host).toBe("127.0.0.1");
      expect(resolved.server.port).toBe(5176);
    } finally {
      if (before === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = before;
    }
  });

  it("[THM-08] the workspace cannot be built for production", () => {
    expect(() => resolveConfig({ command: "build", mode: "production" })).toThrow(
      /cannot be built/,
    );
    const result = spawnSync(
      path.join(root, "node_modules/.bin/vite"),
      ["build", "--config", "vite.config.ts"],
      { cwd: editorDir, env: { ...process.env, APP_ENV: "dev" }, encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/cannot be built for production/);
    expect(fs.existsSync(path.join(editorDir, "dist"))).toBe(false);
  });

  it("[THM-08] the root build and the frontend do not reach the editor", () => {
    const rootPackage = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(rootPackage.scripts.build).toBe("npm run build -w frontend");
    const frontendPackage = read("frontend/package.json");
    expect(frontendPackage).not.toContain("theme-editor");
    for (const file of sourceFiles("frontend")) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/theme-editor/);
    }
  });

  it("[THM-08] the image build copies only the manifest of the workspace, and the context leaves the rest out", () => {
    const copied = read("infrastructure/docker/Dockerfile")
      .split("\n")
      .filter((line) => line.includes("theme-editor"));
    expect(copied.length).toBeGreaterThan(0);
    for (const line of copied) expect(line).toBe("COPY theme-editor/package.json theme-editor/");
    const ignore = read(".dockerignore").split("\n");
    expect(ignore).toContain("/theme-editor/*");
    expect(ignore).toContain("!/theme-editor/package.json");
  });

  it("[THM-08] git tracks no build output of the editor", () => {
    const tracked = execFileSync("git", ["ls-files", "theme-editor"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(tracked).not.toMatch(/theme-editor\/dist\//);
  });
});
