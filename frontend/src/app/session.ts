// The signed-in user in components (ACC-01, ACC-04). SessionProvider loads it.
import { createContext, useContext } from "react";
import type { User } from "@zappaloo/shared";

export interface SessionState {
  /** False until GET /api/session has answered. */
  ready: boolean;
  user: User | null;
  csrfToken: string | null;
  /** Returns undefined on success, else the error code (e.g. "invalid_credentials"). */
  login: (username: string, password: string) => Promise<string | undefined>;
  logout: () => Promise<void>;
  /** Takes over a changed user (profile). */
  setUser: (user: User) => void;
}

export const SessionContext = createContext<SessionState | undefined>(undefined);

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error("useSession needs a SessionProvider");
  return state;
}
