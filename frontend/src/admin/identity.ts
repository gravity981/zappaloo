// The event's identity as the admin edits it (CFG-02, CFG-06).
import type { EventResponse } from "@zappaloo/shared";

export interface EventIdentity {
  name: string;
  timezone: string;
  defaultLanguage: string;
}

/** What the setup form starts with. */
export const DEFAULT_IDENTITY: EventIdentity = {
  name: "",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
};

/** The values of a set-up event, for the form. */
export function identityOf(event: EventResponse): EventIdentity {
  return {
    name: event.name ?? DEFAULT_IDENTITY.name,
    timezone: event.timezone ?? DEFAULT_IDENTITY.timezone,
    defaultLanguage: event.defaultLanguage ?? DEFAULT_IDENTITY.defaultLanguage,
  };
}
