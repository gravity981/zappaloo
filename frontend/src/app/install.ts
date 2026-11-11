// Adding the site to the home screen (PWA-05; sw-architecture.md 19.5, UX mock `install`).
//
// The hint exists only in a mobile browser and never in the installed app. Android browsers
// offer an install prompt (`beforeinstallprompt`, caught as early as this module loads); iOS has
// none, so the page lists the steps of the Share menu.
import { useSyncExternalStore } from "react";

export type Platform = "ios" | "android" | "other";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "zappaloo.installHintDismissed";

/** The platform of the browser; an iPad that poses as a Mac counts as iOS. */
export function detectPlatform(
  userAgent: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints,
): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (userAgent.includes("Macintosh") && touchPoints > 1) return "ios";
  if (userAgent.includes("Android")) return "android";
  return "other";
}

/** True when the site runs as the installed app (no browser around it). */
export function isStandalone(): boolean {
  const iosFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosFlag || window.matchMedia("(display-mode: standalone)").matches;
}

let prompt: InstallPromptEvent | undefined;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // The browser's own mini bar stays away; the page offers the button itself.
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    prompt = undefined;
    installed = true;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export interface InstallState {
  /** Mobile browser, not the installed app: the hint and the install page make sense. */
  available: boolean;
  platform: Platform;
  /** Android: the browser offered its install prompt. */
  canPrompt: boolean;
  /** Opens the browser's install prompt; true if the guest accepted. */
  install: () => Promise<boolean>;
}

async function install(): Promise<boolean> {
  const event = prompt;
  if (!event) return false;
  prompt = undefined; // a prompt can be used once
  notify();
  await event.prompt();
  return installed;
}

export function useInstall(): InstallState {
  const canPrompt = useSyncExternalStore(subscribe, () => prompt !== undefined);
  const done = useSyncExternalStore(subscribe, () => installed);
  const platform = detectPlatform();
  return {
    available: !done && platform !== "other" && !isStandalone(),
    platform,
    canPrompt,
    install,
  };
}

/** Whether the guest hid the strip on the waiting page (kept on this device). */
export function hintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissHint(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Private window or blocked storage: the strip comes back next time.
  }
}
