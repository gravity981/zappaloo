// Where a guest goes right after redeeming an invitation (RSVP-24, sw-architecture.md 7.4.4): to the
// Anmeldung while it is open and still unanswered, whether the platform is closed or open; otherwise
// to the start.
import { rsvpStateSchema, rsvpStatus } from "@zappaloo/shared";
import type { RsvpState } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";

const START = "/";
const RSVP = "/rsvp";

/** The guest has not answered (yet) for the program items they are invited to. */
export function rsvpUnanswered(state: RsvpState): boolean {
  const answer = state.answer;
  return (
    rsvpStatus(
      answer !== null,
      state.programItems.map((item) => item.id),
      answer?.attendingItemIds ?? [],
      answer?.declinedItemIds ?? [],
    ) === "none"
  );
}

/**
 * `/rsvp` for a guest with an open, unanswered RSVP (the feature is on, the deadline has not
 * passed), else `/`. Whatever goes wrong, the guest is not held back: they land on the start.
 */
export async function pathAfterRedeeming(): Promise<string> {
  try {
    const result = await apiRequest("GET", "/api/rsvp");
    const parsed = rsvpStateSchema.safeParse(result.body);
    if (result.ok && parsed.success && !parsed.data.closed && rsvpUnanswered(parsed.data)) {
      return RSVP;
    }
  } catch {
    // The start page is the safe place to land.
  }
  return START;
}
