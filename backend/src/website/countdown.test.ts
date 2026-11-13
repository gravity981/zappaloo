import { describe, expect, it } from "vitest";
import { calendarDay, countdownAt } from "./countdown.ts";

const ZURICH = "Europe/Zurich";
/** The first program item: 12 June 2027, 12:00 in Zurich (summer time, 10:00 UTC). */
const first = { startsAt: new Date("2027-06-12T10:00:00.000Z"), placeName: "Kirche Muri" };

describe("the countdown card (WEB-11)", () => {
  it("[WEB-11] counts the calendar days from today to the day of the first program item", () => {
    const now = new Date("2027-06-10T09:00:00.000Z");
    expect(countdownAt({ first, enabled: true, now, timeZone: ZURICH })).toEqual({
      days: 2,
      date: "2027-06-12",
      placeName: "Kirche Muri",
    });
  });

  it("[WEB-11] changes at midnight in the event's time zone, not in UTC", () => {
    // 23:30 in Zurich on 11 June is 21:30 UTC on 11 June: still one day to go.
    const before = new Date("2027-06-11T21:30:00.000Z");
    expect(countdownAt({ first, enabled: true, now: before, timeZone: ZURICH })?.days).toBe(1);
    // 00:30 in Zurich on 12 June is 22:30 UTC on 11 June: the event day has begun, the card is gone.
    const after = new Date("2027-06-11T22:30:00.000Z");
    expect(countdownAt({ first, enabled: true, now: after, timeZone: ZURICH })).toBeNull();
    // Read in UTC, the same instant would still count one day: the zone decides.
    expect(calendarDay(after, "UTC")).toBe("2027-06-11");
    expect(calendarDay(after, ZURICH)).toBe("2027-06-12");
  });

  it("[WEB-11] says 'Noch 1 Tag' the day before, and nothing on the event day or after", () => {
    expect(
      countdownAt({
        first,
        enabled: true,
        now: new Date("2027-06-11T08:00:00.000Z"),
        timeZone: ZURICH,
      })?.days,
    ).toBe(1);
    expect(
      countdownAt({
        first,
        enabled: true,
        now: new Date("2027-06-12T08:00:00.000Z"),
        timeZone: ZURICH,
      }),
    ).toBeNull();
    expect(
      countdownAt({
        first,
        enabled: true,
        now: new Date("2027-06-20T08:00:00.000Z"),
        timeZone: ZURICH,
      }),
    ).toBeNull();
  });

  it("[WEB-11] has no card without program items, and none while the switch is off", () => {
    const now = new Date("2027-06-10T09:00:00.000Z");
    expect(countdownAt({ first: undefined, enabled: true, now, timeZone: ZURICH })).toBeNull();
    expect(countdownAt({ first, enabled: false, now, timeZone: ZURICH })).toBeNull();
  });
});
