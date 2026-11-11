// What the pages without sign-in know of the event (`GET /api/site`): the name for the brand
// header, and the copyright line and repository address of the footer (LIC-01, LIC-03).
import { useEffect, useSyncExternalStore } from "react";
import { siteResponseSchema } from "@zappaloo/shared";
import type { SiteResponse } from "@zappaloo/shared";
import { useEvent } from "../app/event.ts";

let cached: SiteResponse | undefined;
let loading = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function load(): Promise<void> {
  try {
    const response = await fetch("/api/site");
    cached = siteResponseSchema.parse(await response.json());
    for (const listener of listeners) listener();
  } catch {
    // Not critical: the header then shows the app name, and the footer has no notice.
  }
}

/** The site's public data; undefined until it has been read. */
export function useSite(): SiteResponse | undefined {
  const site = useSyncExternalStore(subscribe, () => cached);
  useEffect(() => {
    if (cached !== undefined || loading) return;
    loading = true;
    void load().finally(() => {
      loading = false;
    });
  }, []);
  return site;
}

/** Reads the data again, after the admin changed the name or the copyright line. */
export function refreshSite(): Promise<void> {
  return load();
}

/** The event's name: from the loaded event after sign-in, else from the public route. */
export function useSiteName(): string | null | undefined {
  const event = useEvent();
  const site = useSite();
  return event?.name ?? site?.name;
}

/** Forgets what was read (tests start from nothing). */
export function resetSiteNameCache(): void {
  cached = undefined;
  loading = false;
}
