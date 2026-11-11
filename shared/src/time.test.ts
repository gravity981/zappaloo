import { describe, expect, it } from "vitest";
import { instantToLocal, localToInstant } from "./time.ts";

describe("event time", () => {
  it("[RSVP-02] converts between the clocks of the event's time zone and instants", () => {
    // Summer time (UTC+2) and winter time (UTC+1) in Zurich.
    expect(localToInstant("2027-06-12T14:00", "Europe/Zurich").toISOString()).toBe(
      "2027-06-12T12:00:00.000Z",
    );
    expect(localToInstant("2027-01-15T14:00", "Europe/Zurich").toISOString()).toBe(
      "2027-01-15T13:00:00.000Z",
    );
    expect(instantToLocal("2027-06-12T12:00:00.000Z", "Europe/Zurich")).toBe("2027-06-12T14:00");
    expect(instantToLocal("2027-06-12T12:00:00.000Z", "America/New_York")).toBe("2027-06-12T08:00");
  });

  it("[RSVP-02] a time round-trips, also across a clock change", () => {
    for (const local of ["2027-03-28T01:30", "2027-03-28T03:30", "2027-10-31T12:00"]) {
      expect(instantToLocal(localToInstant(local, "Europe/Zurich"), "Europe/Zurich")).toBe(local);
    }
  });
});
