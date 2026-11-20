// The update check of the installed app (PWA-06, sw-architecture.md 19.5). An app on the home
// screen is suspended in the background and resumed without a reload, so it can run an old
// release for days. It asks the server for its version and reloads when the release changed.
import { useEffect, useSyncExternalStore } from "react";
import { versionResponseSchema } from "@zappaloo/shared";

/**
 * True if the server runs another release than the one compiled into this client. A server that
 * only adds `-rc.N` to the compiled version runs the same build (the deployment of a release
 * candidate sets the suffix), so that is not a new release.
 */
export function isNewRelease(compiled: string, server: string): boolean {
  if (server === compiled) return false;
  return !(server.startsWith(`${compiled}-`) && /^-rc\.\d+$/.test(server.slice(compiled.length)));
}

/** The server's version, or undefined when it cannot be asked (offline, an error): never a reason to reload. */
export async function fetchServerVersion(signal?: AbortSignal): Promise<string | undefined> {
  try {
    // no-store: an old answer of the browser's cache must not hide a new release.
    const response = await fetch("/api/version", { cache: "no-store", ...(signal && { signal }) });
    if (!response.ok) return undefined;
    return versionResponseSchema.parse(await response.json()).version;
  } catch {
    return undefined;
  }
}

// --- Safe moments --------------------------------------------------------------------------
// A page that must not be reloaded under the guest's hands (in the game: an open overlay or
// dialogue) holds the update; the reload happens when the last hold is released.

let holds = 0;
const listeners = new Set<() => void>();

function changeHolds(by: number): void {
  holds += by;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** While `hold` is true, a new release waits for the end of the hold before the app reloads. */
export function useHoldUpdate(hold: boolean): void {
  useEffect(() => {
    if (!hold) return undefined;
    changeHolds(1);
    return () => {
      changeHolds(-1);
    };
  }, [hold]);
}

/** True while no page holds the update. */
export function useUpdateAllowed(): boolean {
  return useSyncExternalStore(subscribe, () => holds === 0);
}

// --- Loop protection -----------------------------------------------------------------------
// If a reload still delivers the old client (a cache between the server and the phone), reloading
// again would never end. One reload per server version is enough; the next one waits for a restart.

const RELOADED_KEY = "zappaloo.reloadedFor";

export function alreadyReloadedFor(server: string): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === server;
  } catch {
    return false;
  }
}

export function rememberReloadFor(server: string): void {
  try {
    sessionStorage.setItem(RELOADED_KEY, server);
  } catch {
    // Without storage the guard is missing; the version check itself still ends the loop in the normal case.
  }
}
