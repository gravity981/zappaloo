// The draft as the data of a package and back (THM-12, THM-13).
import { fromBase64, toBase64 } from "./base64.ts";
import { FONT_SLOTS, newDraft } from "./model.ts";
import type { DraftFont, FontSlot, ThemeDraft } from "./model.ts";
import type { PackageData } from "./transfer.ts";

/** What «Export» sends: the draft as it is. The server's validator decides whether it is valid. */
export function draftToPackageData(draft: ThemeDraft): PackageData {
  const fonts = {} as PackageData["fonts"];
  for (const slot of FONT_SLOTS) {
    const font = draft.fonts[slot];
    fonts[slot] =
      font === null
        ? null
        : {
            family: font.family,
            sizeAdjust: font.sizeAdjust,
            files: font.files.map((file) => ({
              fileName: file.fileName,
              weight: file.weight,
              style: file.style,
              woff2: toBase64(file.woff2),
            })),
          };
  }
  const icons: PackageData["icons"] = {};
  for (const [name, icon] of Object.entries(draft.icons.files)) {
    if (icon !== undefined) icons[name] = toBase64(icon.png);
  }
  return {
    name: draft.name,
    colors: draft.colors,
    waiting: draft.waitingEnabled ? draft.waiting : null,
    fonts,
    icons,
  };
}

let nextId = 1;

/**
 * What «Open» fills in. The icons of an opened package are icons of their own: there is no source
 * image to make them from.
 */
export function packageDataToDraft(data: PackageData): ThemeDraft {
  const blank = newDraft();
  const fonts = { ...blank.fonts };
  for (const slot of FONT_SLOTS satisfies readonly FontSlot[]) {
    const font = data.fonts[slot];
    if (font === null) continue;
    fonts[slot] = {
      family: font.family,
      sizeAdjust: font.sizeAdjust,
      files: font.files.map((file) => {
        const woff2 = fromBase64(file.woff2);
        return {
          id: `o${String(nextId++)}`,
          fileName: file.fileName,
          weight: file.weight,
          style: file.style,
          size: woff2.length,
          converted: false,
          woff2,
        };
      }),
    } satisfies DraftFont;
  }
  const files: ThemeDraft["icons"]["files"] = {};
  for (const [name, png] of Object.entries(data.icons)) {
    files[name] = { png: fromBase64(png), own: true };
  }
  return {
    ...blank,
    name: data.name,
    colors: { ...data.colors },
    waitingEnabled: data.waiting !== null,
    waiting: data.waiting === null ? blank.waiting : { ...data.waiting },
    fonts,
    icons: { source: null, maskableBackground: data.colors.accent, files },
  };
}
