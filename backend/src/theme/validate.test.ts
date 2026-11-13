import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { checkThemePackage } from "./validate.ts";
import { buildThemeArchive, encodePng, validThemeFiles, VALID_COLORS } from "./build.ts";

const COLORS = VALID_COLORS;
const MANIFEST = { kind: "zappaloo-theme", formatVersion: 1, name: "Sommerfest" };

/** A package that passes every rule. */
const validFiles = (overrides: Record<string, Buffer> = {}) => validThemeFiles(overrides);

const archive = (overrides: Record<string, Buffer> = {}) =>
  buildThemeArchive(validFiles(overrides));
const codes = (result: ReturnType<typeof checkThemePackage>) =>
  result.ok ? [] : result.findings.map((finding) => finding.code);

/** Changes the headers of a tar.gz archive (names, types) and recomputes their checksums. */
function rewriteHeaders(gzipped: Buffer, change: (header: Buffer, index: number) => void): Buffer {
  const tar = gunzipSync(gzipped);
  for (let offset = 0, index = 0; offset + 512 <= tar.length; index++) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    change(header, index);
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
    const size = Number.parseInt(
      header.subarray(124, 136).toString("latin1").replace(/\0.*$/s, ""),
      8,
    );
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return gzipSync(tar);
}

describe("the theme package validator (THM-03)", () => {
  it("accepts a complete package", () => {
    const result = checkThemePackage(archive());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.package.manifest.name).toBe("Sommerfest");
  });

  it("accepts optional fonts and the optional maskable icon when they are right", () => {
    const font = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(64)]);
    const result = checkThemePackage(
      archive({
        "icons/icon-maskable-512.png": encodePng(512, 512, [0, 0, 0]),
        "fonts/lora-400.woff2": font,
        "theme.json": Buffer.from(
          JSON.stringify({
            colors: COLORS,
            fonts: {
              body: {
                family: "Lora",
                files: [{ file: "lora-400.woff2", weight: 400, style: "normal" }],
              },
            },
          }),
        ),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses an archive of more than 10 MB", () => {
    expect(codes(checkThemePackage(Buffer.alloc(10 * 1024 * 1024 + 1)))).toEqual([
      "archive_too_large",
    ]);
  });

  it("refuses something that is not gzip", () => {
    expect(codes(checkThemePackage(Buffer.from("das ist kein Archiv")))).toEqual(["not_gzip"]);
  });

  it("refuses an archive that unpacks to more than 20 MB", () => {
    const big = archive({ "fonts/big.woff2": Buffer.alloc(21 * 1024 * 1024) });
    expect(codes(checkThemePackage(big))).toContain("unpacked_too_large");
  });

  it("refuses links and other special entries", () => {
    const linked = rewriteHeaders(archive(), (header, index) => {
      if (index === 0) header.write("2", 156, 1, "latin1");
    });
    expect(codes(checkThemePackage(linked))).toContain("entry_type");
  });

  it("refuses absolute paths and .. in files and folders", () => {
    const absolute = rewriteHeaders(archive(), (header, index) => {
      if (index === 0) header.write("/etc/passwd", 0, 100, "utf8");
    });
    expect(codes(checkThemePackage(absolute))).toContain("entry_path");
    const traversal = archive({ "icons/../evil.png": Buffer.from("x") });
    expect(codes(checkThemePackage(traversal))).toContain("entry_path");
  });

  it("refuses a file that is in the archive twice", () => {
    const twice = rewriteHeaders(archive(), (header, index) => {
      // Entry 0 is the icons folder, entry 1 manifest.json: entry 2 is renamed to manifest.json.
      if (index === 2) header.write("manifest.json", 0, 100, "utf8");
    });
    expect(codes(checkThemePackage(twice))).toContain("entry_duplicate");
  });

  it("refuses a file that the layout does not name", () => {
    expect(codes(checkThemePackage(archive({ "readme.txt": Buffer.from("hallo") })))).toEqual([
      "file_not_in_layout",
    ]);
  });

  it("refuses a package without manifest.json or theme.json", () => {
    const without = (name: string) => {
      const files = Object.fromEntries(
        Object.entries(validFiles()).filter(([path]) => path !== name),
      );
      return checkThemePackage(buildThemeArchive(files));
    };
    expect(codes(without("manifest.json"))).toContain("file_missing");
    expect(codes(without("theme.json"))).toContain("file_missing");
  });

  it("refuses JSON that does not parse", () => {
    expect(codes(checkThemePackage(archive({ "theme.json": Buffer.from("{ colors") })))).toEqual([
      "json_invalid",
    ]);
  });

  it("refuses a format version the platform does not read", () => {
    const result = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, formatVersion: 2 })) }),
    );
    expect(codes(result)).toEqual(["format_version"]);
  });

  it("refuses an unknown field or a wrong kind in manifest.json", () => {
    const extra = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, author: "x" })) }),
    );
    expect(codes(extra)).toEqual(["json_field"]);
    const kind = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, kind: "other" })) }),
    );
    expect(codes(kind)).toEqual(["json_field"]);
  });

  it("refuses an unknown field in theme.json", () => {
    const result = checkThemePackage(
      archive({ "theme.json": Buffer.from(JSON.stringify({ colors: COLORS, shadow: true })) }),
    );
    expect(codes(result)).toEqual(["json_field"]);
  });

  it("refuses a colour that is not #rrggbb, and a colour that is missing", () => {
    const wrong = checkThemePackage(
      archive({
        "theme.json": Buffer.from(JSON.stringify({ colors: { ...COLORS, text: "dunkel" } })),
      }),
    );
    expect(codes(wrong)).toEqual(["json_field"]);
    const missing = Object.fromEntries(
      Object.entries(COLORS).filter(([key]) => key !== "onAccent"),
    );
    const absent = checkThemePackage(
      archive({ "theme.json": Buffer.from(JSON.stringify({ colors: missing })) }),
    );
    expect(codes(absent)).toEqual(["json_field"]);
  });

  it("refuses a package without one of the three required icons", () => {
    const files = Object.fromEntries(
      Object.entries(validFiles()).filter(([path]) => path !== "icons/icon-192.png"),
    );
    const result = checkThemePackage(buildThemeArchive(files));
    expect(codes(result)).toEqual(["file_missing"]);
  });

  it("refuses an icon that is not a PNG", () => {
    expect(
      codes(checkThemePackage(archive({ "icons/icon-512.png": Buffer.from("GIF89a") }))),
    ).toEqual(["icon_not_png"]);
  });

  it("refuses an icon of the wrong size, the optional maskable one too", () => {
    expect(
      codes(checkThemePackage(archive({ "icons/icon-192.png": encodePng(200, 200, [0, 0, 0]) }))),
    ).toEqual(["icon_size"]);
    expect(
      codes(
        checkThemePackage(
          archive({ "icons/icon-maskable-512.png": encodePng(256, 256, [0, 0, 0]) }),
        ),
      ),
    ).toEqual(["icon_size"]);
  });

  it("refuses a font file that is not WOFF2, and one above 2 MB", () => {
    expect(codes(checkThemePackage(archive({ "fonts/a.woff2": Buffer.from("TTF!") })))).toContain(
      "font_not_woff2",
    );
    const large = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(2 * 1024 * 1024)]);
    expect(codes(checkThemePackage(archive({ "fonts/a.woff2": large })))).toContain(
      "font_too_large",
    );
  });

  it("refuses more than eight font files", () => {
    const fonts: Record<string, Buffer> = {};
    for (let n = 0; n < 9; n++) fonts[`fonts/f${String(n)}.woff2`] = Buffer.from("wOF2xxxx");
    expect(codes(checkThemePackage(archive(fonts)))).toContain("font_count");
  });

  it("refuses a font file that theme.json does not name, and a named file that is missing", () => {
    const font = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(16)]);
    expect(codes(checkThemePackage(archive({ "fonts/a.woff2": font })))).toContain(
      "font_unreferenced",
    );
    const named = archive({
      "theme.json": Buffer.from(
        JSON.stringify({
          colors: COLORS,
          fonts: {
            heading: {
              family: "Playfair",
              files: [{ file: "p.woff2", weight: 700, style: "normal" }],
            },
          },
        }),
      ),
    });
    expect(codes(checkThemePackage(named))).toContain("font_missing");
  });

  it("refuses text that is not readable enough on the background, and on the accent", () => {
    const low = checkThemePackage(
      archive({
        "theme.json": Buffer.from(JSON.stringify({ colors: { ...COLORS, text: "#9a9a9a" } })),
      }),
    );
    expect(codes(low)).toContain("contrast");
    const accent = checkThemePackage(
      archive({
        "theme.json": Buffer.from(JSON.stringify({ colors: { ...COLORS, onAccent: "#7a7a7a" } })),
      }),
    );
    expect(codes(accent)).toContain("contrast");
  });

  it("lists every finding, not only the first", () => {
    const result = checkThemePackage(
      archive({
        "icons/icon-192.png": encodePng(200, 200, [0, 0, 0]),
        "readme.txt": Buffer.from("x"),
      }),
    );
    expect(codes(result).sort()).toEqual(["file_not_in_layout", "icon_size"]);
  });
});
