// The part of fontkit (MIT, no types of its own) that the editor reads from a font file.
declare module "fontkit" {
  export interface Font {
    familyName: string;
    subfamilyName: string;
    italicAngle: number;
    numGlyphs: number;
    "OS/2"?: { usWeightClass?: number };
    name?: { records?: Record<string, Record<string, string> | undefined> };
  }
  export function create(data: Uint8Array): Font;
}
