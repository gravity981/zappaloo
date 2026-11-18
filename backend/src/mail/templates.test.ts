import { describe, expect, it } from "vitest";
import { rsvpReminderMail } from "./templates.ts";

describe("reminder email", () => {
  it('[LANG-03] calls the RSVP "Anmeldung", not "Rückmeldung"', () => {
    const mail = rsvpReminderMail(
      "a@example.ch",
      "Lea & Jonas",
      "Erika",
      "1. Mai 2027",
      "https://x/rsvp",
    );
    const text = `${mail.subject}\n${mail.text}`;
    expect(text).toContain("Anmeldung");
    expect(text).not.toMatch(/Rückmeld/);
  });
});
