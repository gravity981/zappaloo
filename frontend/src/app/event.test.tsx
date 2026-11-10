import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventProvider } from "./EventProvider.tsx";
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

function renderGate() {
  render(
    <EventProvider>
      <FeatureGate feature="gallery" fallback={<p>no gallery</p>}>
        <p>the gallery</p>
      </FeatureGate>
      <FeatureGate feature="minigames">
        <p>the minigames</p>
      </FeatureGate>
    </EventProvider>,
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
});
