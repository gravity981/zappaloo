import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli.ts";
import type { CliIo } from "../cli.ts";
import { buildThemeArchive, validThemeFiles } from "../theme/build.ts";
import { buildTestWorld, testWorldFiles } from "../world/build.ts";
import { buildArchive, encodePng } from "./build.ts";
import { checkPackage } from "./check.ts";
import { tempDir } from "../test-support.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

/** Runs `zappaloo validate` with the given arguments and collects its lines. */
async function validate(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { env: {}, out: (line) => out.push(line), err: (line) => err.push(line) };
  const code = await runCli(["validate", ...argv], io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** Writes a package file into a fresh folder and returns its path. */
function packageFile(bytes: Buffer): string {
  const dir = tempDir("zappaloo-validate-");
  cleanups.push(dir.remove);
  const path = join(dir.path, "package.tar.gz");
  writeFileSync(path, bytes);
  return path;
}

describe("checking a package file (MAP-17, THM-07)", () => {
  it("[MAP-17] the test world is accepted and recognised as a world package", () => {
    const report = checkPackage(buildTestWorld());
    expect(report).toEqual({ ok: true, kind: "world", findings: [] });
  });

  it("[THM-07] the theme package is accepted and recognised as a theme package", () => {
    const report = checkPackage(buildThemeArchive(validThemeFiles()));
    expect(report).toEqual({ ok: true, kind: "theme", findings: [] });
  });

  it("[THM-07] a refused theme package reports its findings as errors", () => {
    const files = validThemeFiles({ "icons/icon-192.png": Buffer.from("x") });
    const report = checkPackage(buildThemeArchive(files));
    expect(report.ok).toBe(false);
    expect(report.kind).toBe("theme");
    expect(report.findings.every((finding) => finding.severity === "error")).toBe(true);
    expect(report.findings.map((finding) => finding.code)).toContain("icon_not_png");
  });

  it("[MAP-17] a package whose manifest names no known kind is refused", () => {
    const files = testWorldFiles();
    files["manifest.json"] = Buffer.from(
      JSON.stringify({ kind: "zappaloo-foto", formatVersion: 1 }),
    );
    const report = checkPackage(buildArchive(files));
    expect(report.ok).toBe(false);
    expect(report.kind).toBeUndefined();
    expect(report.findings.map((finding) => finding.code)).toEqual(["json_field"]);
  });

  it("[MAP-17] a file without a manifest is refused", () => {
    const files = testWorldFiles();
    delete files["manifest.json"];
    expect(checkPackage(buildArchive(files)).findings.map((f) => f.code)).toEqual(["file_missing"]);
  });

  it("[MAP-17] a file that is not an archive is refused", () => {
    const report = checkPackage(Buffer.from("not a package"));
    expect(report.ok).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toEqual(["not_gzip"]);
  });
});

describe("zappaloo validate (MAP-17, THM-07)", () => {
  it("[MAP-17] exits 0 and says the test world is valid", async () => {
    const result = await validate([packageFile(buildTestWorld())]);
    expect(result.code).toBe(0);
    expect(result.out).toBe("Accepted: the world package is valid.");
  });

  it("[THM-07] exits 0 for a valid theme package", async () => {
    const result = await validate([packageFile(buildThemeArchive(validThemeFiles()))]);
    expect(result.code).toBe(0);
    expect(result.out).toBe("Accepted: the theme package is valid.");
  });

  it("[MAP-17] exits 1 and prints every finding with its file and reason for a refused package", async () => {
    const files = testWorldFiles();
    files["maps/garten.json"] = Buffer.from("{");
    files["maps/saal.json"] = Buffer.from("{");
    const result = await validate([packageFile(buildArchive(files))]);
    expect(result.code).toBe(1);
    const lines = result.out.split("\n");
    expect(lines).toEqual([
      "error: maps/garten.json: not valid JSON [json_invalid]",
      "error: maps/saal.json: not valid JSON [json_invalid]",
      "Refused: the world package has 2 error(s).",
    ]);
  });

  it("[MAP-17] prints warnings and still exits 0 for an accepted package", async () => {
    const files = testWorldFiles();
    files["tilesets/ungenutzt.png"] = encodePng(16, 16, [0, 0, 0]);
    const result = await validate([packageFile(buildArchive(files))]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "warning: tilesets/ungenutzt.png: no map uses this image [tileset_unused]",
    );
    expect(result.out.endsWith("Accepted: the world package is valid, with 1 warning(s).")).toBe(
      true,
    );
  });

  it("[MAP-17] --json prints the result as JSON, with the same exit code", async () => {
    const path = packageFile(
      buildArchive({ ...testWorldFiles(), "maps/garten.json": Buffer.from("{") }),
    );
    const result = await validate(["--json", path]);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.out) as {
      ok: boolean;
      kind: string;
      findings: { code: string; severity: string }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.kind).toBe("world");
    expect(parsed.findings).toEqual([
      expect.objectContaining({
        code: "json_invalid",
        severity: "error",
        file: "maps/garten.json",
      }),
    ]);
  });

  it("[MAP-17] a file that cannot be read exits 1 with a message", async () => {
    const result = await validate([join("/nonexistent-zappaloo-dir", "x.tar.gz")]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("Cannot read");
  });

  it("[MAP-17] without a file it prints the usage and exits 1", async () => {
    const result = await validate([]);
    expect(result.code).toBe(1);
    expect(result.err).toBe("Usage: zappaloo validate [--json] <file>");
  });
});
