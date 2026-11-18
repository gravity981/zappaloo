// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { encodePng } from "../../../backend/src/theme/build.ts";
import { suggestPalettes } from "../palette.ts";
import { findingCard, slugOf } from "../transfer.ts";
import type { PackageData } from "../transfer.ts";
import { prepareFont } from "./font.ts";
import { buildPackage, openPackage } from "./package.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const fixtures = path.resolve(import.meta.dirname, "../test-fixtures");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zappaloo-theme-editor-"));
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** A complete theme: every colour, the waiting card, three fonts (one converted from OTF), four icons. */
async function fullTheme(): Promise<PackageData> {
  const otf = await prepareFont(
    "SourceSans3-Regular.otf",
    fs.readFileSync(path.join(fixtures, "SourceSans3-Regular.otf")),
  );
  const ttf = await prepareFont(
    "SourceSansPro-It.ttf",
    fs.readFileSync(path.join(fixtures, "SourceSansPro-It.ttf")),
  );
  const file = (font: typeof otf, weight: number, style: "normal" | "italic" = "normal") => ({
    fileName: font.fileName,
    weight,
    style,
    woff2: b64(font.woff2),
  });
  return {
    name: "Sommerfest 2027",
    colors: {
      background: "#f6f1e7",
      surface: "#fffdf8",
      text: "#2b2a26",
      muted: "#6b6558",
      line: "#ddd3bf",
      accent: "#7a3b2e",
      onAccent: "#ffffff",
    },
    waiting: { card: "#3b2f4a", text: "#ffffff", button: "#ffd27a", onButton: "#2b2a26" },
    fonts: {
      body: { family: "Source Sans Pro", files: [file(ttf, 400, "italic")] },
      heading: { family: "Source Sans 3", files: [file(otf, 400)] },
      display: null,
    },
    icons: {
      "icon-192": b64(encodePng(192, 192, [122, 59, 46])),
      "icon-512": b64(encodePng(512, 512, [122, 59, 46])),
      "apple-touch-icon": b64(encodePng(180, 180, [122, 59, 46])),
      "icon-maskable-512": b64(encodePng(512, 512, [42, 42, 40])),
    },
  };
}

describe("theme package export and open (THM-12, THM-13)", () => {
  it("[THM-12][THM-13] a theme is exported, checked by `zappaloo validate` and opened again unchanged", async () => {
    const theme = await fullTheme();
    const built = buildPackage(theme);
    if (!built.ok) throw new Error(JSON.stringify(built.findings));
    expect(built.fileName).toBe("sommerfest-2027.tar.gz");

    // the platform's own command accepts the file that the editor wrote
    const file = path.join(dir, built.fileName);
    fs.writeFileSync(file, built.archive);
    const run = spawnSync(
      process.execPath,
      [path.join(root, "backend/src/cli.ts"), "validate", file],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect(run.stdout).toMatch(/accepted|valid/i);
    expect(run.status).toBe(0);

    // and opening it gives back what went in, byte for byte
    const opened = openPackage(fs.readFileSync(file));
    if (!opened.ok) throw new Error(JSON.stringify(opened.findings));
    expect(opened.data).toEqual(theme);

    // exporting what was opened gives the same archive
    const again = buildPackage(opened.data);
    if (!again.ok) throw new Error("the opened theme was not exported again");
    expect(again.archive.equals(built.archive)).toBe(true);
  });

  it("[THM-12][THM-13] a theme without fonts, waiting card and maskable icon round-trips too", async () => {
    const { icons, colors } = await fullTheme();
    const minimal: PackageData = {
      name: "Minimal",
      colors,
      waiting: null,
      fonts: { body: null, heading: null, display: null },
      icons: {
        "icon-192": icons["icon-192"] ?? "",
        "icon-512": icons["icon-512"] ?? "",
        "apple-touch-icon": icons["apple-touch-icon"] ?? "",
      },
    };
    const built = buildPackage(minimal);
    if (!built.ok) throw new Error(JSON.stringify(built.findings));
    const opened = openPackage(built.archive);
    expect(opened.ok && opened.data).toEqual(minimal);
  });

  it("[THM-12] a package that the validator refuses is not built, and its findings name the files", async () => {
    const theme = await fullTheme();
    const bad: PackageData = {
      ...theme,
      name: "",
      icons: { ...theme.icons, "icon-192": b64(encodePng(200, 200, [0, 0, 0])) },
      fonts: { ...theme.fonts, display: { family: "Empty", files: [] } },
    };
    const built = buildPackage(bad);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    const byFile = (file: string) => built.findings.filter((finding) => finding.file === file);
    expect(byFile("icons/icon-192.png")[0]?.code).toBe("icon_size");
    expect(byFile("theme.json").some((finding) => finding.detail.startsWith("fonts.display"))).toBe(
      true,
    );
    expect(byFile("manifest.json")).toHaveLength(1);
    expect(built.findings.map((finding) => findingCard(finding)).sort()).toEqual([
      "Fonts",
      "Icons",
      "Name",
    ]);
  });

  it("[THM-12] too little contrast refuses the package, with the pair named", async () => {
    const theme = await fullTheme();
    const built = buildPackage({ ...theme, colors: { ...theme.colors, text: "#9a9486" } });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.findings.map((finding) => finding.detail)).toEqual([
      expect.stringMatching(/«text» on «background»: \d\.\d : 1/),
      expect.stringMatching(/«text» on «surface»/),
    ]);
  });

  it("[THM-15] every suggested palette makes a package that the platform's validator accepts", async () => {
    const theme = await fullTheme();
    let built = 0;
    for (const master of ["#7a3b2e", "#2f6b4f", "#ffd27a", "#1d3557", "#808080", "#000000"]) {
      for (const palette of suggestPalettes(master)) {
        const result = buildPackage({ ...theme, colors: palette.colors, waiting: palette.waiting });
        expect(
          result.ok,
          `${palette.name} of ${master}: ${JSON.stringify(!result.ok && result.findings)}`,
        ).toBe(true);
        built += 1;
      }
    }
    expect(built).toBe(42);
  });

  it("[THM-12] a missing icon is a finding, not a package", async () => {
    const theme = await fullTheme();
    const icons = Object.fromEntries(
      Object.entries(theme.icons).filter(([name]) => name !== "icon-512"),
    );
    const built = buildPackage({ ...theme, icons });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.findings).toContainEqual(
        expect.objectContaining({ file: "icons/icon-512.png", code: "file_missing" }),
      );
    }
  });

  it("[THM-13] a package the validator refuses is not opened, and its findings are returned", () => {
    expect(openPackage(Buffer.from("this is not an archive"))).toMatchObject({
      ok: false,
      findings: [expect.objectContaining({ file: "(archive)" })],
    });
  });

  it("[THM-12] the downloaded file is named after the name, as a slug", () => {
    expect(slugOf("Sommerfest 2027!")).toBe("sommerfest-2027");
    expect(slugOf("Hochzeit Zürich & Bern")).toBe("hochzeit-zurich-bern");
    expect(slugOf("***")).toBe("theme");
  });

  it("[THM-12][THM-13] each finding is shown with the card it belongs to", () => {
    const card = (file: string, detail: string) => findingCard({ file, code: "x", detail });
    expect(card("manifest.json", "name: too small")).toBe("Name");
    expect(card("icons/icon-192.png", "wrong size")).toBe("Icons");
    expect(card("fonts/a.woff2", "larger than 2 MB")).toBe("Fonts");
    expect(card("fonts", "9 files instead of at most 8")).toBe("Fonts");
    expect(card("theme.json", "fonts.body.files: too small")).toBe("Fonts");
    expect(card("theme.json", "colors.text: a colour as #rrggbb")).toBe("Colours");
    expect(card("theme.json", "waiting.card: a colour as #rrggbb")).toBe("Waiting card");
    expect(card("theme.json", "«text» on «waiting card»: 2.0 : 1 (at least 4.5 : 1)")).toBe(
      "Waiting card",
    );
    expect(card("theme.json", "«text» on «surface»: 3.1 : 1 (at least 4.5 : 1)")).toBe("Colours");
    expect(card("(archive)", "not a gzip archive")).toBe("Package");
  });
});
