import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventProvider } from "./EventProvider.tsx";
import { SessionContext } from "./session.ts";
import type { SessionState } from "./session.ts";
import { FeatureGate } from "./FeatureGate.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

const event = (gallery: boolean) => ({
  id: "event-muster",
  name: "Event Muster",
  slug: "event-muster",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  features: {
    minigames: true,
    snapshots: true,
    gallery,
    keepsakes: true,
    rsvp: true,
    treasureHunt: true,
    eventScreen: true,
  },
  settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: false },
});

/** A signed-in user: the event is only loaded with a session (ACS-09). */
const signedIn: SessionState = {
  ready: true,
  user: {
    id: 1,
    username: "anna",
    displayName: "Anna",
    email: null,
    emailStatus: "unverified",
    roles: ["vip"],
    capabilities: [],
  },
  csrfToken: "csrf",
  login: () => Promise.resolve(undefined),
  logout: () => Promise.resolve(),
  setUser: () => undefined,
  clear: () => undefined,
};

function renderGate(session: SessionState = signedIn) {
  render(
    <SessionContext.Provider value={session}>
      <EventProvider>
        <FeatureGate feature="gallery" fallback={<p>no gallery</p>}>
          <p>the gallery</p>
        </FeatureGate>
        <FeatureGate feature="minigames">
          <p>the minigames</p>
        </FeatureGate>
      </EventProvider>
    </SessionContext.Provider>,
  );
}

describe("feature toggles in the UI", () => {
  it("[CFG-03] shows an enabled feature and hides a disabled one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(event(false)))),
    );
    renderGate();
    expect(await screen.findByText("the minigames")).toBeInTheDocument();
    expect(screen.queryByText("the gallery")).not.toBeInTheDocument();
    expect(screen.getByText("no gallery")).toBeInTheDocument();
  });

  it("[CFG-03] shows a feature once the event says it is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(event(true)))),
    );
    renderGate();
    expect(await screen.findByText("the gallery")).toBeInTheDocument();
  });

  it("[ACS-09] does not ask for the event, and shows no feature, without a session", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(event(true))));
    vi.stubGlobal("fetch", fetchMock);
    renderGate({ ...signedIn, user: null, csrfToken: null });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("the minigames")).not.toBeInTheDocument();
  });

  it("[CFG-03] shows no feature while the event is unknown or cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    renderGate();
    await Promise.resolve();
    expect(screen.queryByText("the minigames")).not.toBeInTheDocument();
    expect(screen.queryByText("the gallery")).not.toBeInTheDocument();
  });

  it("[CFG-05] picks up a feature the admin switched meanwhile when the page is shown again", async () => {
    let gallery = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(event(gallery)))),
    );
    renderGate();
    expect(await screen.findByText("no gallery")).toBeInTheDocument();
    gallery = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await screen.findByText("the gallery")).toBeInTheDocument();
  });
});
