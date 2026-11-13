import { describe, expect, it } from "vitest";
import { isEventDay, nowNextAt, statusAt } from "./schedule.ts";
import type { ScheduleEntry } from "./schedule.ts";

/** A time on the event day in Zurich (summer time, UTC+2). */
const zurich = (hm: string) => new Date(`2027-06-12T${hm}:00.000+02:00`);
const entry = (
  id: number,
  name: string,
  start: string,
  end: string | null = null,
): ScheduleEntry => ({
  id,
  name,
  startsAt: zurich(start),
  endsAt: end === null ? null : zurich(end),
  placeName: null,
});
const trauung = entry(1, "Trauung", "12:00", "12:45");
const apero = entry(2, "Apéro", "13:30");
const dinner = entry(3, "Dinner", "16:30");
const schedule = [trauung, apero, dinner];

describe("now and next on the event day (WEB-07)", () => {
  it("[WEB-07] before the first entry, the first one is next and nothing is now", () => {
    expect(nowNextAt(schedule, zurich("11:00"))).toEqual({ now: null, next: trauung });
  });

  it("[WEB-07] during an entry it is now; the one after it is next", () => {
    expect(nowNextAt(schedule, zurich("12:20"))).toEqual({ now: trauung, next: apero });
  });

  it("[WEB-07] between an ended entry and the next one, nothing is now", () => {
    expect(nowNextAt(schedule, zurich("13:00"))).toEqual({ now: null, next: apero });
  });

  it("[WEB-07] an entry without an end lasts until the next one starts", () => {
    expect(nowNextAt(schedule, zurich("15:00"))).toEqual({ now: apero, next: dinner });
  });

  it("[WEB-07] after the last entry starts, it is now and nothing is next", () => {
    expect(nowNextAt(schedule, zurich("23:00"))).toEqual({ now: dinner, next: null });
  });

  it("[WEB-07] sorts the entries by their start, whatever order they come in", () => {
    const shuffled = [dinner, trauung, apero] as ScheduleEntry[];
    expect(nowNextAt(shuffled, zurich("12:20")).next).toEqual(apero);
  });
});

describe("the programme's status of an entry (WEB-09)", () => {
  it("[WEB-07] past entries are greyed out, the current one is marked, later ones are upcoming", () => {
    const now = zurich("15:00");
    const current = apero;
    expect(statusAt(trauung, current, now)).toBe("past");
    expect(statusAt(apero, current, now)).toBe("now");
    expect(statusAt(dinner, current, now)).toBe("upcoming");
  });
});

describe("the event day (WEB-10)", () => {
  const first = zurich("12:00");
  it("[WEB-10] is the calendar day of the first program item in the event's time zone", () => {
    // 00:30 in Zurich on the event day is 22:30 UTC on the day before.
    expect(isEventDay(first, new Date("2027-06-11T22:30:00.000Z"), "Europe/Zurich")).toBe(true);
    // 23:30 in Zurich the day before is still the day before.
    expect(isEventDay(first, new Date("2027-06-11T21:30:00.000Z"), "Europe/Zurich")).toBe(false);
    expect(isEventDay(undefined, zurich("12:00"), "Europe/Zurich")).toBe(false);
  });
});
