import { describe, expect, it } from "vitest";
import { DEFAULT_WAITING_TEXTS, doorSheetSchema, fillWaitingText } from "./waiting.ts";

const values = { name: "Erika", waitingCount: "83", openingDate: "15. Mai 2027" };

describe("waiting page texts", () => {
  it("[ACS-11] fills the three placeholders and leaves unknown ones as written", () => {
    expect(
      fillWaitingText("Hallo {name}, {waitingCount} Gäste, ab {openingDate} {foo}", values),
    ).toBe("Hallo Erika, 83 Gäste, ab 15. Mai 2027 {foo}");
    expect(fillWaitingText("{name} und {name}", values)).toBe("Erika und Erika");
  });

  it("[ACS-11] the default texts speak to the guest by name", () => {
    for (const text of Object.values(DEFAULT_WAITING_TEXTS)) expect(text).toContain("{name}");
    expect(fillWaitingText(DEFAULT_WAITING_TEXTS.attending, values)).toContain(
      "für dich und 83 weitere Gäste",
    );
  });

  it("[ACS-12] a door sprite sheet needs frame size, frame count and speed; the gap is optional", () => {
    const sheet = { frameWidth: 320, frameHeight: 180, frames: 8, fps: 6 };
    expect(doorSheetSchema.safeParse(sheet).success).toBe(true);
    expect(
      doorSheetSchema.safeParse({ ...sheet, gap: { x: 0.4, y: 0.2, width: 0.2, height: 0.6 } })
        .success,
    ).toBe(true);
    for (const bad of [
      { ...sheet, frames: 0 },
      { ...sheet, frameWidth: 8 },
      { ...sheet, fps: 0 },
      { ...sheet, gap: { x: 2, y: 0, width: 1, height: 1 } },
      { ...sheet, unknown: 1 },
      { frameWidth: 320 },
    ]) {
      expect(doorSheetSchema.safeParse(bad).success).toBe(false);
    }
  });
});
