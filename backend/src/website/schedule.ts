// The schedule of the event as the website shows it (WEB-07, WEB-09, WEB-10; sw-architecture.md
// 5.5, 5.6): the event day, "now" and "next" in the event's time zone, and the status of each entry
// on the programme page. The rules are pure functions of the clock, so they are tested directly.
import { calendarDay } from "./countdown.ts";

export interface ScheduleEntry {
  id: number;
  name: string;
  /** The program item the activity belongs to (WEB-12). */
  programItemId: number;
  startsAt: Date;
  endsAt: Date | null;
  placeName: string | null;
}

export type EntryStatus = "past" | "now" | "upcoming";

/** The calendar days (`2027-06-12`, in the event's time zone) that have an activity, earliest first. */
export function eventDays(entries: readonly { startsAt: Date }[], timeZone: string): string[] {
  const days = new Set(entries.map((entry) => calendarDay(entry.startsAt, timeZone)));
  return [...days].sort();
}

/**
 * Whether `now` is on a day that has an activity: every such day is an event day, and its start
 * page and programme show what is on (5.6). A day without an activity is a normal day.
 */
export function isEventDay(
  entries: readonly { startsAt: Date }[],
  now: Date,
  timeZone: string,
): boolean {
  return eventDays(entries, timeZone).includes(calendarDay(now, timeZone));
}

/**
 * Whether the event is under way at `now`: from the first day with an activity to the last, days
 * without an activity in between included. The programme marks past and current activities then
 * and only then (a day without an activity in the middle of a multi-day programme still has past
 * activities before it).
 */
export function isEventUnderWay(
  entries: readonly { startsAt: Date }[],
  now: Date,
  timeZone: string,
): boolean {
  const days = eventDays(entries, timeZone);
  const today = calendarDay(now, timeZone);
  const first = days[0];
  const last = days.at(-1);
  return first !== undefined && last !== undefined && today >= first && today <= last;
}

/**
 * "Now" is the latest entry that has started and has not ended (an entry without an end lasts until
 * the next one starts, but not beyond its own calendar day in `timeZone`, so the last activity of
 * a day is not still on the next morning); "next" is the first entry that starts after `now`.
 */
export function nowNextAt(
  entries: readonly ScheduleEntry[],
  now: Date,
  timeZone?: string,
): { now: ScheduleEntry | null; next: ScheduleEntry | null } {
  const sorted = [...entries].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const started = sorted.filter((entry) => entry.startsAt.getTime() <= now.getTime());
  const latest = started.at(-1) ?? null;
  const sameDay =
    latest !== null &&
    (timeZone === undefined ||
      calendarDay(latest.startsAt, timeZone) === calendarDay(now, timeZone));
  const current =
    latest !== null && (latest.endsAt === null ? sameDay : latest.endsAt.getTime() > now.getTime())
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
