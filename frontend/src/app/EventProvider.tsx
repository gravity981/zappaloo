// Loads the event once from GET /api/event. While it is loading, or if it cannot
// be loaded, no feature is shown (the server refuses disabled features anyway).
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { eventResponseSchema } from "@zappaloo/shared";
import type { EventResponse } from "@zappaloo/shared";
import { EventContext } from "./event.ts";

export function EventProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<EventResponse>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/event", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        setEvent(eventResponseSchema.parse(body));
      })
      .catch(() => {
        // Not critical for the page itself: features stay hidden.
      });
    return () => {
      controller.abort();
    };
  }, []);

  return <EventContext.Provider value={event}>{children}</EventContext.Provider>;
}
