import { beforeAll, describe, expect, it } from "vitest";
import i18next from "i18next";
import { initI18n } from "../i18n/i18n.ts";
import { ACTIVITY_ACTIONS } from "@zappaloo/shared";
import { activityText, relativeTime } from "./activity.ts";

beforeAll(async () => {
  await initI18n();
});

describe("the card Zuletzt", () => {
  it("[DATA-05] every listed audit action has a sentence, with and without a name, and as a group", () => {
    const t = i18next.t.bind(i18next);
    for (const action of ACTIVITY_ACTIONS) {
      for (const [name, count] of [
        ["Erika", 1],
        [null, 1],
        [null, 4],
      ] as const) {
        const text = activityText(t, {
          action,
          createdAt: "2027-01-01T10:00:00.000Z",
          count,
          name,
        });
        // A missing key would show the key itself.
        expect(text, `${action} ${String(name)} ${String(count)}`).not.toMatch(/admin\.activity/);
        expect(text.length).toBeGreaterThan(5);
        // A single entry has a sentence of its own; only groups may fall back to "n Änderungen".
        if (count === 1) {
          expect(text, `${action} ${String(name)}`).not.toMatch(/^\d+ Änderung/);
        }
      }
    }
  });

  it("[DATA-05] words the time relative to now", () => {
    const now = Date.parse("2027-01-10T12:00:00.000Z");
    expect(relativeTime("2027-01-10T10:00:00.000Z", "de", now)).toMatch(/2 Std/);
    expect(relativeTime("2027-01-09T11:00:00.000Z", "de", now)).toMatch(/gestern|1 Tag/);
    expect(relativeTime("2027-01-10T11:58:00.000Z", "de", now)).toMatch(/2 Min/);
    expect(relativeTime("2027-01-10T12:00:00.000Z", "de", now)).toMatch(/Minute|0 Min/);
  });
});
