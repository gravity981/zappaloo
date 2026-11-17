import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zappaloo/game-engine", () => ({
  createGame: vi.fn(),
  setGameGuides: vi.fn(),
  setGamePaused: vi.fn(),
  setGameSelection: vi.fn(),
  setGameView: vi.fn(),
}));

import App from "./App.tsx";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("standalone world preview (MAP-18)", () => {
  it("[MAP-18] reports validation findings without showing a scene on the first failed load", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith("/local-package/status")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              active: false,
              loading: false,
              revision: 0,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (!requestUrl(input).endsWith("/packages") || init?.method !== "POST") {
        return Promise.resolve(new Response("Unexpected preview request", { status: 500 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            findings: [
              {
                file: "manifest.json",
                code: "json_field",
                severity: "error",
                detail: "the package is invalid",
              },
            ],
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(screen.getByRole("checkbox", { name: "Occlusion debug" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("World package"), {
      target: {
        files: [new File(["bad archive"], "invalid.tar.gz", { type: "application/gzip" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load package" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("manifest.json");
    expect(screen.getByRole("alert")).toHaveTextContent("the package is invalid");
    expect(
      screen.queryByRole("region", { name: "World canvas" })?.querySelector("canvas"),
    ).toBeNull();
    expect(await screen.findByText("No world loaded")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => requestUrl(input).endsWith("/packages")),
      ).toHaveLength(1);
    });
  });

  it("[MAP-18] starts a watched local package preview with the absolute path entered in the UI", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/local-package/status")) {
        return Promise.resolve(
          new Response(JSON.stringify({ active: false, loading: false, revision: 0 }), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.endsWith("/local-package/start") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              active: false,
              loading: false,
              revision: 0,
              error: { message: "World package does not exist.", findings: [] },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("Unexpected preview request", { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.change(screen.getByLabelText("Local world package path"), {
      target: { value: "/workspaces/hz-event-assets/world.tar.gz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview and watch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("World package does not exist.");
    const startCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input).endsWith("/local-package/start"),
    );
    expect(startCall?.[1]?.body).toBe(
      JSON.stringify({ archivePath: "/workspaces/hz-event-assets/world.tar.gz" }),
    );
  });
});
