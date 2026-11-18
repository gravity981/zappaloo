// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as fontkit from "fontkit";
import { FontRefused, prepareFont, woff2FileName } from "./font.ts";

const fixtures = path.resolve(import.meta.dirname, "../test-fixtures");
// Source Sans 3 and Source Sans Pro Italic (SIL OFL, see SourceSans3-LICENSE.md), an OpenType font with CFF outlines: the case that a TrueType-only
// converter would get wrong.
const otf = fs.readFileSync(path.join(fixtures, "SourceSans3-Regular.otf"));
const ttf = fs.readFileSync(path.join(fixtures, "SourceSansPro-It.ttf"));

describe("font files of the theme package editor (THM-09)", () => {
  it("[THM-09] converts an OTF with CFF outlines to WOFF2 and suggests family, weight and style", async () => {
    expect(otf.toString("latin1", 0, 4)).toBe("OTTO");
    const prepared = await prepareFont("SourceSans3-Regular.otf", otf);
    expect(prepared.converted).toBe(true);
    expect(prepared.fileName).toBe("SourceSans3-Regular.woff2");
    expect(prepared.woff2.toString("latin1", 0, 4)).toBe("wOF2");
    expect(prepared.suggestion).toEqual({ family: "Source Sans 3", weight: 400, style: "normal" });
    // The WOFF2 holds the same font: it reads back as the same font with the same glyphs.
    const back = fontkit.create(prepared.woff2);
    expect(back.numGlyphs).toBe(fontkit.create(otf).numGlyphs);
  });

  it("[THM-09] converts a TTF to WOFF2", async () => {
    const prepared = await prepareFont("SourceSansPro-It.ttf", ttf);
    expect(prepared.converted).toBe(true);
    expect(prepared.woff2.length).toBeLessThan(ttf.length);
    expect(prepared.suggestion.style).toBe("italic");
    expect(prepared.suggestion.weight).toBe(400);
  });

  it("[THM-09] keeps a WOFF2 file as it is and reads its family", async () => {
    const once = await prepareFont("a.otf", otf);
    const again = await prepareFont("again.woff2", once.woff2);
    expect(again.converted).toBe(false);
    expect(again.woff2.equals(once.woff2)).toBe(true);
    expect(again.suggestion.family).toBe("Source Sans 3");
  });

  it("[THM-09] refuses a file that is no font, a WOFF 1 file and a font that is too large", async () => {
    await expect(prepareFont("notes.ttf", Buffer.from("hello world"))).rejects.toBeInstanceOf(
      FontRefused,
    );
    const woff1 = Buffer.concat([Buffer.from("wOFF"), Buffer.alloc(60)]);
    await expect(prepareFont("old.woff", woff1)).rejects.toThrow(/WOFF 1/);
    // A WOFF2 over 2 MB is refused by the validator's font check.
    const big = Buffer.concat([Buffer.from("wOF2"), Buffer.alloc(2 * 1024 * 1024 + 1)]);
    await expect(prepareFont("big.woff2", big)).rejects.toThrow();
  });

  it("[THM-09] names the file in fonts/ so that the package accepts it", () => {
    expect(woff2FileName("Lora Bold (1).ttf")).toBe("Lora-Bold-1-.woff2");
    expect(woff2FileName("C:\\fonts\\Lora.OTF")).toBe("Lora.woff2");
    expect(woff2FileName("___.ttf")).toBe("font.woff2");
  });
});
