// The technical details of an unexpected error (WEB-13, WEB-14; UX mock `app-error`): what the
// disclosure "Technische Details" shows and what "Details kopieren" puts into the clipboard. Pure
// functions, so they are tested without a browser. The details hold no personal data: no name,
// account, cookie, token or query, and nothing is sent anywhere.
import { isRouteErrorResponse } from "react-router";

export type ErrorKind = "module" | "other";

/** What the browser says when a script of the app cannot be loaded (Chromium, Firefox, Safari, Vite's dev server). */
const MODULE_ERRORS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "doesn't provide an export named",
  "does not provide an export named",
];

export interface ErrorDetails {
  kind: ErrorKind;
  /** Short and stable for the same message on the same page: `E-7B20E5`. */
  number: string;
  message: string;
  /** The path without query and fragment. */
  page: string;
  /** ISO 8601, UTC. */
  time: string;
  /** The version of the app and the commit it was built from (`unknown` while the server's answer is not there). */
  version: string;
  commit: string;
  browser: string;
  stack: string;
}

/** The message of whatever was thrown: an Error, a response of a router loader, a string, anything. */
export function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim();
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function errorKind(error: unknown): ErrorKind {
  const message = errorMessage(error);
  return MODULE_ERRORS.some((part) => message.includes(part)) ? "module" : "other";
}

/** `E-` and six hex digits (FNV-1a over message and page): the guest can read it out on the phone. */
export function errorNumber(message: string, page: string): string {
  let hash = 0x811c9dc5;
  for (const char of `${message}\n${page}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `E-${(hash & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}

/** "Safari 18.1 auf iOS 18.1"-style summary of a user agent; the full string is not kept (it identifies a browser too well). */
export function browserName(userAgent: string): string {
  const pick = (re: RegExp): string | undefined => re.exec(userAgent)?.[1]?.replace(/_/g, ".");
  const browsers: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  const systems: [string, RegExp][] = [
    ["iOS", /OS ([\d_]+) like Mac OS X/],
    ["Android", /Android ([\d.]+)/],
    ["Windows", /Windows NT ([\d.]+)/],
    ["macOS", /Mac OS X ([\d_]+)/],
    ["Linux", /Linux()/],
  ];
  const browser = browsers.flatMap(([name, re]) => {
    const version = pick(re);
    return version ? [`${name} ${version}`] : [];
  })[0];
  const system = systems.flatMap(([name, re]) => {
    const version = pick(re);
    return version === undefined ? [] : [version ? `${name} ${version}` : name];
  })[0];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "unknown";
}

export interface ErrorContext {
  /** `location.pathname`; a query or fragment is cut off here as well. */
  path: string;
  now: Date;
  version: string;
  commit?: string;
  userAgent: string;
}

export function buildErrorDetails(error: unknown, context: ErrorContext): ErrorDetails {
  const message = errorMessage(error);
  const path = context.path.split(/[?#]/)[0] ?? "";
  const page = path === "" ? "/" : path;
  const stack = error instanceof Error && error.stack ? error.stack : message;
  return {
    kind: errorKind(error),
    number: errorNumber(message, page),
    message,
    page,
    time: context.now.toISOString(),
    version: context.version,
    commit: context.commit ?? "unknown",
    browser: browserName(context.userAgent),
    stack,
  };
}

/** Plain text for "Details kopieren": one line per fact, then the stack. `labels` are the German names of the screen. */
export function detailsAsText(
  details: ErrorDetails,
  labels: Record<"number" | "message" | "page" | "time" | "version" | "browser", string>,
): string {
  return [
    `${labels.number}: ${details.number}`,
    `${labels.message}: ${details.message}`,
    `${labels.page}: ${details.page}`,
    `${labels.time}: ${details.time} (UTC)`,
    `${labels.version}: ${details.version} (${details.commit})`,
    `${labels.browser}: ${details.browser}`,
    "",
    details.stack,
  ].join("\n");
}
