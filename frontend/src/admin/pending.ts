// The number of companion requests waiting for a decision (RSVP-09), for the badge in the
// navigation. A page that changes it tells the badge with `notifyRsvpChanged`.
import { useEffect } from "react";
import { rsvpPendingSchema } from "@zappaloo/shared";
import { useAdminData } from "./data.ts";

const CHANGED = "zappaloo:rsvp-changed";

/** Tells the badge that requests were decided or arrived. */
export function notifyRsvpChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** The pending requests; undefined while loading. */
export function usePendingRequests(): number | undefined {
  const { data, reload } = useAdminData("/api/admin/rsvp/pending", rsvpPendingSchema);
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => {
      window.removeEventListener(CHANGED, reload);
    };
  }, [reload]);
  return data?.pendingCount;
}
