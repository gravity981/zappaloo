// Loads the session from GET /api/session and offers login and logout.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { sessionResponseSchema } from "@zappaloo/shared";
import type { SessionResponse, User } from "@zappaloo/shared";
import { apiRequest } from "./api.ts";
import { SessionContext } from "./session.ts";
import type { SessionState } from "./session.ts";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SessionResponse>({ user: null, csrfToken: null });

  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", "/api/session")
      .then((result) => {
        const parsed = sessionResponseSchema.safeParse(result.body);
        if (!cancelled && parsed.success) setSession(parsed.data);
      })
      .catch(() => {
        // Not signed in as far as we can tell.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiRequest("POST", "/api/session", { body: { username, password } });
    const parsed = sessionResponseSchema.safeParse(result.body);
    if (!result.ok || !parsed.success) return result.errorCode ?? "unknown";
    setSession(parsed.data);
    return undefined;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("DELETE", "/api/session", { csrfToken: session.csrfToken });
    setSession({ user: null, csrfToken: null });
  }, [session.csrfToken]);

  const setUser = useCallback((user: User) => {
    setSession((current) => ({ ...current, user }));
  }, []);

  const value = useMemo<SessionState>(
    () => ({ ready, user: session.user, csrfToken: session.csrfToken, login, logout, setUser }),
    [ready, session, login, logout, setUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
