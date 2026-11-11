import { describe, expect, it } from "vitest";
import { closesAt, startOfDay } from "./deadline.ts";

describe("RSVP deadline", () => {
  it("[RSVP-04] closes at the end of the deadline day in the event's time zone", () => {
    // Summer time (UTC+2): the day ends at 22:00 UTC.
    expect(closesAt("2027-05-01", "Europe/Zurich").toISOString()).toBe("2027-05-01T22:00:00.000Z");
    // Winter time (UTC+1).
    expect(closesAt("2027-01-15", "Europe/Zurich").toISOString()).toBe("2027-01-15T23:00:00.000Z");
  });

  it("[RSVP-04] handles the day of a clock change and zones west of UTC", () => {
    // 2027-03-28: Zurich changes to summer time at 02:00; the day after starts at UTC+2.
    expect(startOfDay("2027-03-28", "Europe/Zurich").toISOString()).toBe(
      "2027-03-27T23:00:00.000Z",
    );
    expect(closesAt("2027-03-28", "Europe/Zurich").toISOString()).toBe("2027-03-28T22:00:00.000Z");
    expect(closesAt("2027-05-01", "America/New_York").toISOString()).toBe(
      "2027-05-02T04:00:00.000Z",
    );
    expect(closesAt("2027-12-31", "UTC").toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });
});
