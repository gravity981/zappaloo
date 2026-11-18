import { describe, expect, it } from "vitest";
import { newDraft } from "./model.ts";
import { draftToPackageData, packageDataToDraft } from "./packageData.ts";

describe("the draft as the data of a package (THM-12, THM-13)", () => {
  it("[THM-12][THM-13] a draft becomes package data and comes back with the same fields, fonts and icons", () => {
    const draft = newDraft();
    draft.name = "Sommerfest";
    draft.colors.accent = "#7a3b2e";
    draft.waitingEnabled = true;
    draft.waiting.card = "#3b2f4a";
    draft.fonts.display = {
      family: "Cormorant",
      files: [
        {
          id: "x",
          fileName: "c.woff2",
          weight: 600,
          style: "italic",
          size: 4,
          converted: true,
          woff2: new Uint8Array([0, 1, 254, 255]),
        },
      ],
    };
    draft.icons.files["icon-512"] = { png: new Uint8Array([137, 80, 78, 71]), own: false };
    const data = draftToPackageData(draft);
    expect(data.waiting?.card).toBe("#3b2f4a");
    expect(data.fonts.body).toBeNull();
    expect(data.fonts.display?.files[0]?.woff2).toBe("AAH+/w==");
    expect(Object.keys(data.icons)).toEqual(["icon-512"]);

    const back = packageDataToDraft(data);
    expect(back.name).toBe("Sommerfest");
    expect(back.colors).toEqual(draft.colors);
    expect(back.waitingEnabled).toBe(true);
    expect(back.waiting.card).toBe("#3b2f4a");
    expect(back.fonts.display?.files[0]).toMatchObject({
      fileName: "c.woff2",
      weight: 600,
      style: "italic",
      size: 4,
      converted: false,
    });
    expect(Array.from(back.fonts.display?.files[0]?.woff2 ?? [])).toEqual([0, 1, 254, 255]);
    // opened icons are icons of their own: there is no source image to make them from
    expect(back.icons.source).toBeNull();
    expect(back.icons.files["icon-512"]?.own).toBe(true);
    expect(Array.from(back.icons.files["icon-512"]?.png ?? [])).toEqual([137, 80, 78, 71]);
  });

  it("[THM-12] without the waiting card colours no waiting entry is sent", () => {
    expect(draftToPackageData(newDraft()).waiting).toBeNull();
  });
});
