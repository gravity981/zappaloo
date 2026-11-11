// Calls to the backend API. State-changing requests carry the session's CSRF
// token (SEC-01, sw-architecture.md 7.1.1).
import { apiErrorSchema } from "@zappaloo/shared";

export interface ApiResult {
  ok: boolean;
  status: number;
  /** The parsed JSON body, or undefined (204, no JSON). */
  body: unknown;
  /** The machine-readable error code of a failed call, e.g. "invalid_credentials". */
  errorCode: string | undefined;
}

/** Error code of a call that did not reach the server (offline, connection lost). */
export const NETWORK_ERROR = "network_error";

const sessionEndedListeners = new Set<() => void>();

/**
 * Calls `listener` whenever the server answers `401 unauthorized`: the session has ended
 * (logout on another device, password changed, account deleted). Returns an unsubscribe.
 */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

/**
 * Calls the API. It never throws: a network failure is a result with the code
 * `network_error`, so no form waits forever.
 */
export async function apiRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: { body?: unknown; csrfToken?: string | null } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.csrfToken) headers["x-csrf-token"] = options.csrfToken;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    return { ok: false, status: 0, body: undefined, errorCode: NETWORK_ERROR };
  }
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    body = undefined;
  }
  const error = apiErrorSchema.safeParse(body);
  if (response.status === 401 && error.success && error.data.error.code === "unauthorized") {
    for (const listener of sessionEndedListeners) listener();
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    errorCode: error.success ? error.data.error.code : undefined,
  };
}
