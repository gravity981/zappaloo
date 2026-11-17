import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@zappaloo/game-engine", () => ({
  createGame: vi.fn(),
  setGameGuides: vi.fn(),
  setGameSelection: vi.fn(),
  setGameView: vi.fn(),
}));

import App from "./App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("standalone world preview (MAP-18)", () => {
  it("[MAP-18] reports validation findings without showing a scene on the first failed load", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

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
    expect(await screen.findByText("No world package loaded")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
