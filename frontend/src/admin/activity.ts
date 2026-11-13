// The card "Zuletzt" (DATA-05): one sentence per audit entry and a relative time.
import type { TFunction } from "i18next";
import type { ActivityEntry } from "@zappaloo/shared";

/** Actions whose sentence names nobody and nothing. */
const NAMELESS = [
  "rsvp.deadline",
  "rsvp.song",
  "rsvp.per_item",
  "rsvp.companion_approval",
  "waiting.set",
  "platform.open",
  "platform.close",
  "privacy.set",
  "event.setup",
  "content.pages.order",
  "content.start.set",
  "content.image.upload",
];

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The sentence of an entry. Its keys are built from the audit action (`rsvp.answer` →
 * `admin.activity.rsvp_answer`, with `_unnamed` and `_many` variants), so they cannot be checked
 * by the compiler; a test runs every action through here.
 */
export function activityText(t: TFunction, entry: ActivityEntry): string {
  const translate = t as unknown as Translate;
  const key = `admin.activity.${entry.action.replaceAll(".", "_")}`;
  const changes = (count: number) => translate("admin.activity.changes", { count });
  if (entry.action === "rsvp.remind") return translate(key, { count: entry.count });
  if (NAMELESS.includes(entry.action)) return translate(key);
  // Settings and features name what changed with a fixed key, which the page translates.
  if (["setting.set", "feature.set", "event.set"].includes(entry.action)) {
    if (entry.name === null) return translate("admin.activity.setting_unnamed");
    const name =
      entry.action === "feature.set"
        ? translate(`admin.features.${entry.name}`, { defaultValue: entry.name })
        : translate(`admin.activity.settingNames.${entry.name}`, { defaultValue: entry.name });
    return translate("admin.activity.setting", { name });
  }
  if (entry.count > 1) {
    return translate(`${key}_many`, { count: entry.count, defaultValue: changes(entry.count) });
  }
  return entry.name === null
    ? translate(`${key}_unnamed`, { defaultValue: changes(1) })
    : translate(key, { name: entry.name });
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "vor 2 Std." */
export function relativeTime(iso: string, language: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return formatter.format(Math.trunc(diff / size), unit);
  }
  return formatter.format(0, "minute");
}
