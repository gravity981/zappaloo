// Adding the site to the home screen (PWA-05; sw-architecture.md 19.5, UX mock `install`).
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import { anna, event, fakeBackend, renderAt, user } from "../test/backend.tsx";
import { detectPlatform } from "./install.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const closedEvent = { ...event, settings: { ...event.settings, platformOpen: false } };
const guest = { ...anna, displayName: "Erika" };

function backend() {
  fakeBackend({
    "GET /api/session": () => ({ status: 200, body: { user: guest, csrfToken: "csrf-1" } }),
    "GET /api/event": () => ({ status: 200, body: closedEvent }),
    "GET /api/site": () => ({ status: 200, body: { name: "Lea & Jonas" } }),
    "GET /api/waiting": () => ({
      status: 200,
      body: {
        eventName: "Lea & Jonas",
        open: false,
        status: "none",
        text: "Psst, Erika.",
        countdownTo: null,
        rsvp: true,
      },
    }),
    "GET /api/waiting/door": () => ({ status: 200, body: { kind: "default" } }),
  });
}

const userAgent = (value: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);

describe("which browser the hint is for", () => {
  it("[PWA-05] tells iOS and Android browsers from the rest, an iPad posing as a Mac included", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(PIXEL, 5)).toBe("android");
    expect(detectPlatform(DESKTOP, 0)).toBe("other");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("other");
  });
});

describe("the strip on the waiting page", () => {
  it("[PWA-05] shows in a mobile browser, leads to the steps and hides for good with ×", async () => {
    userAgent(IPHONE);
    backend();
    renderAt("/");
    expect(await screen.findByText(/Lea & Jonas als App auf dem Startbildschirm/)).toBeVisible();
    expect(screen.getByRole("link", { name: "So geht's" })).toHaveAttribute("href", "/install");
    user.click(screen.getByRole("button", { name: "Ausblenden" }));
    expect(screen.queryByText(/als App auf dem Startbildschirm/)).not.toBeInTheDocument();
    expect(localStorage.getItem("zappaloo.installHintDismissed")).toBe("1");
  });

  it("[PWA-05] stays away once it was hidden on this device", async () => {
    userAgent(IPHONE);
    localStorage.setItem("zappaloo.installHintDismissed", "1");
    backend();
    renderAt("/");
    await screen.findByText("Psst, Erika.");
    expect(screen.queryByText(/als App auf dem Startbildschirm/)).not.toBeInTheDocument();
  });

  it("[PWA-05] never shows on a desktop browser", async () => {
    userAgent(DESKTOP);
    backend();
    renderAt("/");
    await screen.findByText("Psst, Erika.");
    expect(screen.queryByText(/als App auf dem Startbildschirm/)).not.toBeInTheDocument();
  });

  it("[PWA-05] never shows in the installed app (display mode standalone)", async () => {
    userAgent(IPHONE);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("standalone") }));
    backend();
    renderAt("/");
    await screen.findByText("Psst, Erika.");
    expect(screen.queryByText(/als App auf dem Startbildschirm/)).not.toBeInTheDocument();
  });

  it("[PWA-05] never shows in the installed app on iOS (navigator.standalone)", async () => {
    userAgent(IPHONE);
    vi.stubGlobal("navigator", Object.create(navigator, { standalone: { value: true } }));
    backend();
    renderAt("/");
    await screen.findByText("Psst, Erika.");
    expect(screen.queryByText(/als App auf dem Startbildschirm/)).not.toBeInTheDocument();
  });
});

describe("the card in the profile", () => {
  it("[PWA-05] offers the install page in a mobile browser, and only there", async () => {
    userAgent(PIXEL);
    backend();
    renderAt("/profile");
    expect(await screen.findByRole("link", { name: "Auf den Startbildschirm" })).toHaveAttribute(
      "href",
      "/install",
    );
  });

  it("[PWA-05] is not there on a desktop browser", async () => {
    userAgent(DESKTOP);
    backend();
    renderAt("/profile");
    await screen.findByRole("heading", { name: "Mein Profil" });
    expect(screen.queryByRole("link", { name: "Auf den Startbildschirm" })).not.toBeInTheDocument();
  });
});

describe("the install page", () => {
  it("[PWA-05] iOS: three steps of the Share menu and the note about signing in again", async () => {
    userAgent(IPHONE);
    backend();
    renderAt("/install");
    expect(await screen.findByText("Als App installieren")).toBeVisible();
    expect(screen.getByText("So geht's in Safari")).toBeVisible();
    expect(screen.getByText("Teilen")).toBeVisible();
    expect(screen.getByText("Zum Home-Bildschirm")).toBeVisible();
    expect(screen.getByText("Hinzufügen")).toBeVisible();
    expect(screen.getByText(/meldest du dich einmal neu an: iOS speichert/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Installieren" })).not.toBeInTheDocument();
  });

  it("[PWA-05] Android without a prompt: the steps of the browser menu, no install button", async () => {
    userAgent(PIXEL);
    backend();
    renderAt("/install");
    expect(await screen.findByText("Zum Startbildschirm hinzufügen")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Installieren" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verstanden" })).toBeVisible();
  });

  it("[PWA-05] has nothing to do on a desktop browser and leads back to the start page", async () => {
    userAgent(DESKTOP);
    backend();
    renderAt("/install");
    expect(await screen.findByText("Psst, Erika.")).toBeVisible();
  });

  it("[PWA-05] Android with the browser's prompt: the button opens it", async () => {
    userAgent(PIXEL);
    backend();
    renderAt("/install");
    await screen.findByText("Als App installieren");
    const prompt = vi.fn(() => Promise.resolve());
    const offered = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(offered, { prompt });
    act(() => {
      window.dispatchEvent(offered);
    });
    // The browser's own mini bar is kept away; the page offers the button.
    expect(offered.defaultPrevented).toBe(true);
    const button = await screen.findByRole("button", { name: "Installieren" });
    expect(screen.getByRole("button", { name: "Später" })).toBeVisible();
    user.click(button);
    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
  });
});
