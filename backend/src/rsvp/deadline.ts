// The RSVP deadline is a calendar day; the RSVP closes when that day ends in the event's time
// zone (RSVP-04, sw-architecture.md 7.4.1).
import { localToInstant } from "@zappaloo/shared";

/** The instant at which `date` (`YYYY-MM-DD`) starts in `timeZone`. */
export function startOfDay(date: string, timeZone: string): Date {
  return localToInstant(`${date}T00:00`, timeZone);
}

/** The instant at which the RSVP closes: the end of the deadline day in the event's zone. */
export function closesAt(deadline: string, timeZone: string): Date {
  const [year, month, day] = deadline.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return startOfDay(next, timeZone);
}
