// The profiles of the signed-in guest and their companions, loaded once and shared by the person tabs and the
// editor (UX mock `profile`: the tabs sit above the cards, the editor below them).
import { useEffect, useState } from "react";
import { profilePeopleResponseSchema } from "@zappaloo/shared";
import type { ProfilePeopleResponse } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";

export interface ProfilePeople {
  data: ProfilePeopleResponse | undefined;
  setData: (data: ProfilePeopleResponse) => void;
  failed: boolean;
  /** The id of the selected person: `me` or a companion's id. */
  who: string;
  setWho: (who: string) => void;
}

/** Loads the profiles; nothing is requested while `enabled` is false (a user without a profile). */
export function useProfilePeople(enabled = true): ProfilePeople {
  const [data, setData] = useState<ProfilePeopleResponse>();
  const [failed, setFailed] = useState(false);
  const [who, setWho] = useState("me");
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void apiRequest("GET", "/api/profile/people").then((result) => {
      const parsed = profilePeopleResponseSchema.safeParse(result.body);
      if (cancelled) return;
      if (result.ok && parsed.success) setData(parsed.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { data, setData, failed, who, setWho };
}
