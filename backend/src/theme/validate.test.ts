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

/** One ustar header block (512 bytes) with a name, a size and a type, and its checksum. */
function tarHeader(name: string, size: number, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "latin1");
  header.write("0000000\0", 108, 8, "latin1");
  header.write("0000000\0", 116, 8, "latin1");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "latin1");
  header.write("00000000000\0", 136, 12, "latin1");
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "latin1");
  header.write("ustar\0", 257, 6, "latin1");
  header.write("00", 263, 2, "latin1");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return header;
}

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
  it("[THM-03] accepts a complete package", () => {
    const result = checkThemePackage(archive());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.package.manifest.name).toBe("Sommerfest");
  });

  it("[THM-03] accepts optional fonts and the optional maskable icon when they are right", () => {
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

  it("[THM-03] refuses an archive of more than 10 MB", () => {
    expect(codes(checkThemePackage(Buffer.alloc(10 * 1024 * 1024 + 1)))).toEqual([
      "archive_too_large",
    ]);
  });

  it("[THM-03] refuses something that is not gzip", () => {
    expect(codes(checkThemePackage(Buffer.from("das ist kein Archiv")))).toEqual(["not_gzip"]);
  });

  it("[THM-03] refuses an archive that unpacks to more than 20 MB", () => {
    const big = archive({ "fonts/big.woff2": Buffer.alloc(21 * 1024 * 1024) });
    expect(codes(checkThemePackage(big))).toContain("unpacked_too_large");
  });

  it("[THM-03] refuses links and other special entries", () => {
    const linked = rewriteHeaders(archive(), (header, index) => {
      if (index === 0) header.write("2", 156, 1, "latin1");
    });
    expect(codes(checkThemePackage(linked))).toContain("entry_type");
  });

  it("[THM-03] refuses absolute paths and .. in files and folders", () => {
    const absolute = rewriteHeaders(archive(), (header, index) => {
      if (index === 0) header.write("/etc/passwd", 0, 100, "utf8");
    });
    expect(codes(checkThemePackage(absolute))).toContain("entry_path");
    const traversal = archive({ "icons/../evil.png": Buffer.from("x") });
    expect(codes(checkThemePackage(traversal))).toContain("entry_path");
  });

  it("[THM-03] refuses a file that is in the archive twice", () => {
    const twice = rewriteHeaders(archive(), (header, index) => {
      // Entry 0 is the icons folder, entry 1 manifest.json: entry 2 is renamed to manifest.json.
      if (index === 2) header.write("manifest.json", 0, 100, "utf8");
    });
    expect(codes(checkThemePackage(twice))).toContain("entry_duplicate");
  });

  it("[THM-03] refuses a folder that is in the archive twice", () => {
    const folders = Buffer.concat([tarHeader("icons/", 0, "5"), tarHeader("icons/", 0, "5")]);
    expect(
      codes(checkThemePackage(gzipSync(Buffer.concat([folders, Buffer.alloc(1024)])))),
    ).toEqual(["entry_duplicate"]);
  });

  it("[THM-03] refuses an archive that ends inside an entry, instead of reading a shorter file", () => {
    // manifest.json declares 1000 bytes, but only 100 follow the header.
    const cut = Buffer.concat([tarHeader("manifest.json", 1000), Buffer.alloc(100)]);
    expect(codes(checkThemePackage(gzipSync(cut)))).toEqual(["not_tar"]);
  });

  it("[THM-03] refuses a file that the layout does not name", () => {
    expect(codes(checkThemePackage(archive({ "readme.txt": Buffer.from("hallo") })))).toEqual([
      "file_not_in_layout",
    ]);
  });

  it("[THM-03] refuses a package without manifest.json or theme.json", () => {
    const without = (name: string) => {
      const files = Object.fromEntries(
        Object.entries(validFiles()).filter(([path]) => path !== name),
      );
      return checkThemePackage(buildThemeArchive(files));
    };
    expect(codes(without("manifest.json"))).toContain("file_missing");
    expect(codes(without("theme.json"))).toContain("file_missing");
  });

  it("[THM-03] refuses JSON that does not parse", () => {
    expect(codes(checkThemePackage(archive({ "theme.json": Buffer.from("{ colors") })))).toEqual([
      "json_invalid",
    ]);
  });

  it("[THM-02] refuses a format version the platform does not read", () => {
    const result = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, formatVersion: 2 })) }),
    );
    expect(codes(result)).toEqual(["format_version"]);
  });

  it("[THM-03] refuses an unknown field or a wrong kind in manifest.json", () => {
    const extra = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, author: "x" })) }),
    );
    expect(codes(extra)).toEqual(["json_field"]);
    const kind = checkThemePackage(
      archive({ "manifest.json": Buffer.from(JSON.stringify({ ...MANIFEST, kind: "other" })) }),
    );
    expect(codes(kind)).toEqual(["json_field"]);
  });

  it("[THM-03] refuses an unknown field in theme.json", () => {
    const result = checkThemePackage(
      archive({ "theme.json": Buffer.from(JSON.stringify({ colors: COLORS, shadow: true })) }),
    );
    expect(codes(result)).toEqual(["json_field"]);
  });

  it("[THM-03] refuses a colour that is not #rrggbb, and a colour that is missing", () => {
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

  it("[THM-03] refuses a package without one of the three required icons", () => {
    const files = Object.fromEntries(
      Object.entries(validFiles()).filter(([path]) => path !== "icons/icon-192.png"),
    );
    const result = checkThemePackage(buildThemeArchive(files));
    expect(codes(result)).toEqual(["file_missing"]);
  });

  it("[THM-03] refuses an icon that is not a PNG", () => {
    expect(
      codes(checkThemePackage(archive({ "icons/icon-512.png": Buffer.from("GIF89a") }))),
    ).toEqual(["icon_not_png"]);
  });

  it("[THM-03] refuses an icon of the wrong size, the optional maskable one too", () => {
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

  it("[THM-03] refuses a font file that is not WOFF2, and one above 2 MB", () => {
    expect(codes(checkThemePackage(archive({ "fonts/a.woff2": Buffer.from("TTF!") })))).toContain(
      "font_not_woff2",
    );
    const large = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(2 * 1024 * 1024)]);
    expect(codes(checkThemePackage(archive({ "fonts/a.woff2": large })))).toContain(
      "font_too_large",
    );
  });

  it("[THM-03] refuses more than eight font files", () => {
    const fonts: Record<string, Buffer> = {};
    for (let n = 0; n < 9; n++) fonts[`fonts/f${String(n)}.woff2`] = Buffer.from("wOF2xxxx");
    expect(codes(checkThemePackage(archive(fonts)))).toContain("font_count");
  });

  it("[THM-03] refuses a font file that theme.json does not name, and a named file that is missing", () => {
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

  it("[THM-03] refuses text that is not readable enough on the background, and on the accent", () => {
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

  it("[THM-03] accepts a waiting card of its own, and refuses it when its text is not readable", () => {
    const waiting = { card: "#fffaf0", text: "#2a2420", button: "#2a2420", onButton: "#ffffff" };
    const good = checkThemePackage(
      archive({
        "theme.json": Buffer.from(JSON.stringify({ colors: COLORS, waiting })),
      }),
    );
    expect(good.ok).toBe(true);
    const low = checkThemePackage(
      archive({
        "theme.json": Buffer.from(
          JSON.stringify({ colors: COLORS, waiting: { ...waiting, text: "#c9c0b0" } }),
        ),
      }),
    );
    if (low.ok) throw new Error("a waiting card with low contrast should be refused");
    expect(codes(low)).toContain("contrast");
    expect(low.findings.map((finding) => finding.detail).join(" ")).toContain("waiting card");
  });

  it("[THM-03] refuses a waiting card with a field the format does not know", () => {
    const result = checkThemePackage(
      archive({
        "theme.json": Buffer.from(
          JSON.stringify({ colors: COLORS, waiting: { card: "#ffffff", shadow: "#000000" } }),
        ),
      }),
    );
    expect(codes(result)).toContain("json_field");
  });

  it("[THM-03] lists every finding, not only the first", () => {
    const result = checkThemePackage(
      archive({
        "icons/icon-192.png": encodePng(200, 200, [0, 0, 0]),
        "readme.txt": Buffer.from("x"),
      }),
    );
    expect(codes(result).sort()).toEqual(["file_not_in_layout", "icon_size"]);
  });
});
