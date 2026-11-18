import { describe, expect, it } from "vitest";
import { shortCodeOf, shortCodeSchema } from "./rsvp.ts";

describe("short forms (RSVP-23)", () => {
  it("[RSVP-23] a program item or menu shows its Kürzel, by default the first letter in capitals", () => {
    expect(shortCodeOf({ name: "Dinner", shortCode: null })).toBe("D");
    expect(shortCodeOf({ name: "apéro", shortCode: null })).toBe("A");
    expect(shortCodeOf({ name: "Vegetarisch", shortCode: "Vt" })).toBe("Vt");
  });

  it("[RSVP-23] the Kürzel has one or two characters", () => {
    expect(shortCodeSchema.safeParse("T").success).toBe(true);
    expect(shortCodeSchema.safeParse(" Tr ").data).toBe("Tr");
    expect(shortCodeSchema.safeParse("").success).toBe(false);
    expect(shortCodeSchema.safeParse("Tra").success).toBe(false);
  });
});
