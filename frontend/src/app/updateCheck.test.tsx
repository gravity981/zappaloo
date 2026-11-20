import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateWatcher } from "./UpdateWatcher.tsx";
import { isNewRelease, useHoldUpdate } from "./updateCheck.ts";

const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  vi.stubGlobal("location", { reload });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function serverRuns(version: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ version, commit: "abc" }))),
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function comeBackToForeground() {
  document.dispatchEvent(new Event("visibilitychange"));
}

function Holder({ hold }: { hold: boolean }) {
  useHoldUpdate(hold);
  return null;
}

describe("which versions count as a new release", () => {
  it("[PWA-06] another version is a new release; the same one, or the same one with -rc.N, is not", () => {
    expect(isNewRelease("1.2.0", "1.3.0")).toBe(true);
    expect(isNewRelease("1.2.0+build.5", "1.2.0+build.6")).toBe(true);
    expect(isNewRelease("1.2.0", "1.2.0")).toBe(false);
    expect(isNewRelease("1.2.0", "1.2.0-rc.4")).toBe(false);
    expect(isNewRelease("1.2.0", "1.2.0-beta")).toBe(true);
  });
});

describe("the update watcher", () => {
  it("[PWA-06] reloads at once when the server runs another release at the start", async () => {
    serverRuns("9.9.9");
    render(<UpdateWatcher />);
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("[PWA-06] does nothing while the server runs the same release", async () => {
    serverRuns(__APP_VERSION__);
    render(<UpdateWatcher />);
    await settle();
    comeBackToForeground();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("[PWA-06] checks again when the app comes back to the foreground", async () => {
    serverRuns(__APP_VERSION__);
    render(<UpdateWatcher />);
    await settle();
    serverRuns("9.9.9");
    comeBackToForeground();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("[PWA-06] waits for a safe moment: an open overlay holds the reload until it closes", async () => {
    serverRuns("9.9.9");
    const view = render(
      <>
        <UpdateWatcher />
        <Holder hold />
      </>,
    );
    await settle();
    expect(reload).not.toHaveBeenCalled();
    view.rerender(
      <>
        <UpdateWatcher />
        <Holder hold={false} />
      </>,
    );
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("[PWA-06] reloads only once for a version, so a stale cache cannot make a loop", async () => {
    serverRuns("9.9.9");
    const first = render(<UpdateWatcher />);
    await settle();
    first.unmount();
    // The page "restarts" but still carries the old client: same session, same server version.
    render(<UpdateWatcher />);
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("[PWA-06] an unreachable server is no reason to reload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<UpdateWatcher />);
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });
});
