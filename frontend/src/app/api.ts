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

export async function apiRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { body?: unknown; csrfToken?: string | null } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.csrfToken) headers["x-csrf-token"] = options.csrfToken;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    body = undefined;
  }
  const error = apiErrorSchema.safeParse(body);
  return {
    ok: response.ok,
    status: response.status,
    body,
    errorCode: error.success ? error.data.error.code : undefined,
  };
}
