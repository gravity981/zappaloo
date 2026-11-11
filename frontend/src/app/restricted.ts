// While the platform is closed, signed-in guests reach only the waiting page, the RSVP, their
// profile and the public pages; staff and admins reach everything (ACS-10). The server
// enforces the same rule; this only decides what the pages show.
import { useEvent } from "./event.ts";
import { useSession } from "./session.ts";

/** True for a signed-in user who is held at the waiting page. */
export function useRestricted(): boolean {
  const event = useEvent();
  const { user } = useSession();
  if (!user || !event?.setupComplete) return false;
  if (event.settings.platformOpen) return false;
  return !user.roles.includes("staff") && !user.roles.includes("admin");
}
