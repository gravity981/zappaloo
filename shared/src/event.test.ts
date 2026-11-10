import { describe, expect, it } from "vitest";
import { eventConfigSchema, FEATURE_NAMES, SETTING_NAMES } from "./event.ts";

const valid = {
  id: "event-muster",
  name: "Event Muster",
  slug: "event-muster",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  theme: { config: "theme.json" },
  features: Object.fromEntries(FEATURE_NAMES.map((name) => [name, true])),
  settings: Object.fromEntries(SETTING_NAMES.map((name) => [name, false])),
};

function issues(config: unknown): string[] {
  const result = eventConfigSchema.safeParse(config);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("event.json schema", () => {
  it("[CFG-02] accepts the example configuration", () => {
    expect(eventConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("[CFG-02] rejects missing and unknown keys, so typos are found at startup", () => {
    const { features, ...withoutFeatures } = valid;
    expect(issues(withoutFeatures).join("\n")).toContain("features");
    const fewer: Record<string, boolean> = { ...features };
    delete fewer.minigames;
    expect(issues({ ...valid, features: fewer }).join("\n")).toContain("features.minigames");
    expect(issues({ ...valid, features: { ...features, minigame: true } })).not.toEqual([]);
    expect(issues({ ...valid, extra: 1 })).not.toEqual([]);
    expect(issues({ ...valid, settings: { ...valid.settings, platformOpen: "yes" } })).not.toEqual(
      [],
    );
  });

  it("[CFG-02] checks id, slug, name, time zone, language and theme file", () => {
    expect(issues({ ...valid, id: "Event Muster" })).not.toEqual([]);
    expect(issues({ ...valid, slug: "../etc" })).not.toEqual([]);
    expect(issues({ ...valid, name: "  " })).not.toEqual([]);
    expect(issues({ ...valid, timezone: "Mars/Olympus" })).not.toEqual([]);
    expect(issues({ ...valid, defaultLanguage: "deu" })).not.toEqual([]);
    expect(issues({ ...valid, theme: { config: "../theme.json" } })).not.toEqual([]);
    expect(issues({ ...valid, theme: { config: "theme.txt" } })).not.toEqual([]);
  });
});
