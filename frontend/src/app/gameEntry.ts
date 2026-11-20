// Entering the game (GAME-12, GAME-13, GAME-17): whether a world is active, whether the player has left the game for
// the website in this browser session, and whether the guided first entry still has to run.
import { useEffect, useState } from "react";
import { avatarResponseSchema, publicWorldSchema } from "@zappaloo/shared";
import { apiRequest } from "./api.ts";

const WEBSITE_KEY = "zappaloo.game.website";

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
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

const nullableWorld = publicWorldSchema.nullable();

/** What the page asks of the world: whether one is active and the welcome dialogue the admin picked (GAME-17). */
export interface WorldEntry {
  active: boolean;
  welcomeDialogue: string | null;
}

/** The world as the game page needs it: undefined while it is asked; without a world or when it cannot be read, not active. */
export function useWorldEntry(enabled: boolean): WorldEntry | undefined {
  const [entry, setEntry] = useState<WorldEntry>();
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void apiRequest("GET", "/api/world").then((result) => {
      if (cancelled) return;
      const parsed = nullableWorld.safeParse(result.body);
      const world = result.ok && parsed.success ? parsed.data : null;
      setEntry({ active: world !== null, welcomeDialogue: world?.welcomeDialogue ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? entry : { active: false, welcomeDialogue: null };
}

/** Whether a world is active: undefined while it is asked, false without a world or when it cannot be read. */
export function useWorldActive(enabled: boolean): boolean | undefined {
  return useWorldEntry(enabled)?.active;
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
