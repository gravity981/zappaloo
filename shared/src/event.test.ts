import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURES,
  DEFAULT_SETTINGS,
  eventSetupSchema,
  eventUpdateSchema,
  FEATURE_NAMES,
  SETTING_NAMES,
} from "./event.ts";

const valid = { name: "Event Muster", timezone: "Europe/Zurich", defaultLanguage: "de" };

function issues(setup: unknown): string[] {
  const result = eventSetupSchema.safeParse(setup);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("event setup", () => {
  it("[CFG-02] accepts name, time zone and default language", () => {
    expect(eventSetupSchema.safeParse(valid).success).toBe(true);
  });

  it("[CFG-02] checks name, time zone and language, and rejects missing and unknown keys", () => {
    expect(issues({ ...valid, name: "  " })).not.toEqual([]);
    expect(issues({ ...valid, timezone: "Mars/Olympus" })).not.toEqual([]);
    expect(issues({ ...valid, defaultLanguage: "deu" })).not.toEqual([]);
    expect(issues({ name: "x", timezone: "UTC" }).join("\n")).toContain("defaultLanguage");
    expect(issues({ ...valid, slug: "event-muster" })).not.toEqual([]);
  });

  it("[CFG-05] a new event starts with all features on and the platform and uploads closed", () => {
    expect(Object.keys(DEFAULT_FEATURES)).toEqual([...FEATURE_NAMES]);
    expect(Object.values(DEFAULT_FEATURES).every(Boolean)).toBe(true);
    expect(Object.keys(DEFAULT_SETTINGS)).toEqual([...SETTING_NAMES]);
    expect(Object.values(DEFAULT_SETTINGS).some(Boolean)).toBe(false);
  });
});

describe("event update", () => {
  it("[CFG-06] takes name, time zone and language next to features and settings", () => {
    expect(eventUpdateSchema.safeParse({ name: "New name" }).success).toBe(true);
    expect(eventUpdateSchema.safeParse({ timezone: "UTC", defaultLanguage: "en" }).success).toBe(
      true,
    );
    expect(eventUpdateSchema.safeParse({ settings: { snapshotUploadsOpen: true } }).success).toBe(
      true,
    );
  });

  it("[ACS-14] the generic update does not open the platform: that goes through its own route", () => {
    expect(eventUpdateSchema.safeParse({ settings: { platformOpen: true } }).success).toBe(false);
  });

  it("[CFG-06] needs at least one value and checks each", () => {
    expect(eventUpdateSchema.safeParse({}).success).toBe(false);
    expect(eventUpdateSchema.safeParse({ features: {} }).success).toBe(false);
    expect(eventUpdateSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(eventUpdateSchema.safeParse({ name: " " }).success).toBe(false);
  });
});
