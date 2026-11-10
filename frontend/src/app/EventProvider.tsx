// Loads the event from GET /api/event once the user is signed in (the API needs a session,
// ACS-09), and again whenever the page becomes visible, so a feature the admin switched
// meanwhile shows up (CFG-05). While it is loading, or if it cannot be loaded, no feature is
// shown (the server refuses disabled features anyway).
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { eventResponseSchema } from "@zappaloo/shared";
import type { EventResponse } from "@zappaloo/shared";
import { apiRequest } from "./api.ts";
import { EventContext } from "./event.ts";
import { useSession } from "./session.ts";

export function EventProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<EventResponse>();
  const signedIn = useSession().user !== null;

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const load = () => {
      void apiRequest("GET", "/api/event").then((result) => {
        const parsed = eventResponseSchema.safeParse(result.body);
        // Not critical for the page itself: without the event, features stay hidden.
        if (active && result.ok && parsed.success) setLoaded(parsed.data);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);

  return (
    <EventContext.Provider value={signedIn ? loaded : undefined}>{children}</EventContext.Provider>
  );
}
