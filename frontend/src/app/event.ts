// Access to the event of this installation and its feature toggles in components
// (CFG-03, CFG-05; sw-architecture.md 19.3.1). EventProvider loads it.
import { createContext, useContext } from "react";
import type { EventResponse, FeatureName } from "@zappaloo/shared";

export const EventContext = createContext<EventResponse | undefined>(undefined);

/** The event, or undefined while it is loading or if it could not be loaded. */
export function useEvent(): EventResponse | undefined {
  return useContext(EventContext);
}

/** Whether the feature is enabled for this event; false while unknown. */
export function useFeature(name: FeatureName): boolean {
  return useEvent()?.features[name] ?? false;
}
