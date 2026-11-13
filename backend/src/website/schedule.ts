// The schedule of the event as the website shows it (WEB-07, WEB-09, WEB-10; sw-architecture.md
// 5.5, 5.6): the event day, "now" and "next" in the event's time zone, and the status of each entry
// on the programme page. The rules are pure functions of the clock, so they are tested directly.
import { calendarDay } from "./countdown.ts";

export interface ScheduleEntry {
  id: number;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  placeName: string | null;
}

export type EntryStatus = "past" | "now" | "upcoming";

/** Whether `now` is on the day of the first program item (the event day starts at its midnight). */
export function isEventDay(first: Date | undefined, now: Date, timeZone: string): boolean {
  return first !== undefined && calendarDay(now, timeZone) === calendarDay(first, timeZone);
}

/**
 * "Now" is the latest entry that has started and has not ended (an entry without an end lasts until
 * the next one starts); "next" is the first entry that starts after `now`.
 */
export function nowNextAt(
  entries: readonly ScheduleEntry[],
  now: Date,
): { now: ScheduleEntry | null; next: ScheduleEntry | null } {
  const sorted = [...entries].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const started = sorted.filter((entry) => entry.startsAt.getTime() <= now.getTime());
  const latest = started.at(-1) ?? null;
  const current =
    latest !== null && (latest.endsAt === null || latest.endsAt.getTime() > now.getTime())
      ? latest
      : null;
  const next = sorted.find((entry) => entry.startsAt.getTime() > now.getTime()) ?? null;
  return { now: current, next };
}

/** The status of an entry on the programme page: greyed out once it is past, marked while current. */
export function statusAt(
  entry: ScheduleEntry,
  current: ScheduleEntry | null,
  now: Date,
): EntryStatus {
  if (current !== null && entry.id === current.id) return "now";
  return entry.startsAt.getTime() < now.getTime() ? "past" : "upcoming";
}
