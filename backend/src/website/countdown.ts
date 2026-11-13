// The countdown card of the start page (WEB-11, sw-architecture.md 5.6): the calendar days in the
// event's time zone from today to the day of the first program item, with that item's date and
// place. The card is gone on the event day and after it, and without program items.

export interface FirstItem {
  startsAt: Date;
  placeName: string | null;
}

export interface Countdown {
  days: number;
  /** The day of the first program item, `2027-06-12`, in the event's time zone. */
  date: string;
  placeName: string | null;
}

const DAY_MS = 86_400_000;

/** The calendar day (`2027-06-12`) of an instant in a time zone. */
export function calendarDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The countdown at `now`, or null when there is nothing to count down to. */
export function countdownAt(options: {
  first: FirstItem | undefined;
  enabled: boolean;
  now: Date;
  timeZone: string;
}): Countdown | null {
  const { first, enabled, now, timeZone } = options;
  if (!enabled || first === undefined) return null;
  const today = calendarDay(now, timeZone);
  const day = calendarDay(first.startsAt, timeZone);
  const days = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  );
  if (days < 1) return null;
  return { days, date: day, placeName: first.placeName };
}
