// Loads the event from GET /api/event once the user is signed in (the API needs a session,
// ACS-09). While it is loading, or if it cannot be loaded, no feature is shown (the server
// refuses disabled features anyway).
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { eventResponseSchema } from "@zappaloo/shared";
import type { EventResponse } from "@zappaloo/shared";
import { EventContext } from "./event.ts";
import { useSession } from "./session.ts";

export function EventProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<EventResponse>();
  const signedIn = useSession().user !== null;

  useEffect(() => {
    if (!signedIn) return undefined;
    const controller = new AbortController();
    fetch("/api/event", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        setLoaded(eventResponseSchema.parse(body));
      })
      .catch(() => {
        // Not critical for the page itself: features stay hidden.
      });
    return () => {
      controller.abort();
    };
  }, [signedIn]);

  return (
    <EventContext.Provider value={signedIn ? loaded : undefined}>{children}</EventContext.Provider>
  );
}
