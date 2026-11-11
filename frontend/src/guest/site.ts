// The name of the event for the brand header of the pages without sign-in (`GET /api/site`).
import { useEffect, useState } from "react";
import { siteResponseSchema } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";

let cached: string | null | undefined;

/** The event's name: from the loaded event after sign-in, else from the public route. */
export function useSiteName(): string | null | undefined {
  const event = useEvent();
  const [name, setName] = useState<string | null | undefined>(cached);
  useEffect(() => {
    if (cached !== undefined) return;
    const controller = new AbortController();
    fetch("/api/site", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        cached = siteResponseSchema.parse(body).name;
        setName(cached);
      })
      .catch(() => {
        // Not critical: the header then shows the app name.
      });
    return () => {
      controller.abort();
    };
  }, []);
  return event?.name ?? name;
}

/** Forgets the name that was read (tests start from nothing). */
export function resetSiteNameCache(): void {
  cached = undefined;
}
