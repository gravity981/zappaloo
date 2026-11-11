// Loading and changing data in the admin area.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { eventResponseSchema } from "@zappaloo/shared";
import type { EventUpdate } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSetEvent } from "../app/event.ts";
import { useSession } from "../app/session.ts";

/** The text for an error code, e.g. "last_admin"; `overrides` words it for one page. */
export function useErrorText(overrides: Partial<Record<string, string>> = {}) {
  const { t } = useTranslation();
  return (code: string | undefined): string =>
    (code === undefined ? undefined : overrides[code]) ??
    t(`errors.${code ?? "unknown"}`, { defaultValue: t("errors.unknown") });
}

/** What a shared schema offers to check an answer (the frontend does not use zod directly). */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Loads `path` and parses it with `schema`; `reload` loads it again (after a change).
 * `data` stays undefined while loading or if the answer does not fit.
 */
export function useAdminData<T>(path: string, schema: Parser<T>) {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState<string>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void apiRequest("GET", path).then((result) => {
      if (cancelled) return;
      const parsed = schema.safeParse(result.body);
      if (result.ok && parsed.success) {
        setData(parsed.data);
        setFailed(undefined);
      } else {
        setFailed(result.errorCode ?? "unknown");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, schema, version]);
  return { data, failed, reload };
}

/** A state-changing call with the session's CSRF token. */
export function useAdminCall() {
  const { csrfToken } = useSession();
  return useCallback(
    (method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
      apiRequest(method, path, { csrfToken, ...(body === undefined ? {} : { body }) }),
    [csrfToken],
  );
}

/** Loads the event again (after the platform was opened or closed) and takes it over. */
export function useRefreshEvent() {
  const setEvent = useSetEvent();
  return useCallback(async () => {
    const result = await apiRequest("GET", "/api/event");
    const parsed = eventResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) setEvent(parsed.data);
  }, [setEvent]);
}

/**
 * Changes features or settings (`PATCH /api/admin/event`, CFG-05) and takes over the answer,
 * so every page shows the new state at once. Returns the error code, or undefined.
 */
export function useEventUpdate() {
  const call = useAdminCall();
  const setEvent = useSetEvent();
  return useCallback(
    async (changes: EventUpdate): Promise<string | undefined> => {
      const result = await call("PATCH", "/api/admin/event", changes);
      const parsed = eventResponseSchema.safeParse(result.body);
      if (result.ok && parsed.success) {
        setEvent(parsed.data);
        return undefined;
      }
      return result.errorCode ?? "unknown";
    },
    [call, setEvent],
  );
}
