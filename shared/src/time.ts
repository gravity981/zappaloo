// Times of an event are shown and entered in the event's time zone (19.3.1), whatever the
// time zone of the browser or the server is. Stored times stay instants (UTC).

/** The offset of `timeZone` from UTC at `instant` (milliseconds since 1970), in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the clocks of `timeZone` show `local`, `YYYY-MM-DDTHH:mm` (the value of
 * an `<input type="datetime-local">`).
 */
export function localToInstant(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) throw new RangeError(`not a local date-time: ${local}`);
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Twice, because the offset at the guess can differ from the offset at the result (DST).
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone));
}

/** What the clocks of `timeZone` show at `instant`, as `YYYY-MM-DDTHH:mm`. */
export function instantToLocal(instant: string | Date, timeZone: string): string {
  const time = new Date(instant).getTime();
  return new Date(time + offsetAt(time, timeZone)).toISOString().slice(0, 16);
}
