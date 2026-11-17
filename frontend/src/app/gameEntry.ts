// Entering the game (GAME-12, GAME-13, GAME-17): whether a world is active, whether the player has left the game for
// the website in this browser session, whether the guided first entry still has to run, and whether the hint for
// clickable objects was seen.
import { useEffect, useState } from "react";
import { avatarResponseSchema, publicWorldSchema } from "@zappaloo/shared";
import { apiRequest } from "./api.ts";

const WEBSITE_KEY = "zappaloo.game.website";
const HINT_KEY = "zappaloo.game.hintSeen";

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function localStore(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The player went to the website in this browser session: `/` shows the start page instead of the game. */
export function markWebsiteVisit(): void {
  try {
    sessionStore()?.setItem(WEBSITE_KEY, "1");
  } catch {
    // Without storage, `/` leads into the game again.
  }
}

export function hasVisitedWebsite(): boolean {
  try {
    return sessionStore()?.getItem(WEBSITE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The hint "Tippe auf Dinge, die funkeln" is shown until the first object is used, on this device (GAME-17). */
export function hintSeen(): boolean {
  try {
    return localStore()?.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHintSeen(): void {
  try {
    localStore()?.setItem(HINT_KEY, "1");
  } catch {
    // The hint shows again on the next entry.
  }
}

const nullableWorld = publicWorldSchema.nullable();

/** Whether a world is active: undefined while it is asked, false without a world or when it cannot be read. */
export function useWorldActive(enabled: boolean): boolean | undefined {
  const [active, setActive] = useState<boolean>();
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void apiRequest("GET", "/api/world").then((result) => {
      if (cancelled) return;
      const parsed = nullableWorld.safeParse(result.body);
      setActive(result.ok && parsed.success && parsed.data !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? active : false;
}

/** Whether somebody (the user or an approved companion) has no figure yet: the guided first entry starts with it. */
export function useFirstEntry(): [boolean | undefined, () => void] {
  const [needed, setNeeded] = useState<boolean>();
  useEffect(() => {
    let cancelled = false;
    void apiRequest("GET", "/api/avatar").then((result) => {
      if (cancelled) return;
      const parsed = avatarResponseSchema.safeParse(result.body);
      setNeeded(
        result.ok &&
          parsed.success &&
          parsed.data.persons.some((person) => !person.chosen && person.figures.length > 0),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return [
    needed,
    () => {
      setNeeded(false);
    },
  ];
}
