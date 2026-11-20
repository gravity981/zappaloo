// The error screen (WEB-13, WEB-14; UX mock `app-error`).
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../i18n/locales/de/common.json";
import { initI18n } from "../i18n/i18n.ts";
import { AppErrorBoundary, ErrorScreen, RouteErrorScreen } from "./ErrorScreen.tsx";

beforeAll(async () => {
  await initI18n();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(Response.json({ version: "2.1.0", commit: "abc1234" })),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error("Cannot read properties of undefined (reading 'lines')");
}

describe("error screen", () => {
  it("[WEB-13] a page that fails shows the friendly screen instead of the router's own page", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <Broken />, errorElement: <RouteErrorScreen /> },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(de.error.title);
    expect(screen.queryByText(/Hey developer/)).toBeNull();
    expect(screen.getByRole("button", { name: de.error.reload })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: de.error.home })).toHaveAttribute("href", "/");
  });

  it("[WEB-13] an error outside the router is caught by the boundary around the app", async () => {
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(de.error.title);
  });

  it("[WEB-13] a module that cannot be loaded says so and suggests the reload", async () => {
    render(
      <ErrorScreen
        error={new TypeError("Failed to fetch dynamically imported module: /assets/G.js")}
      />,
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      de.error.moduleTitle,
    );
    expect(screen.getByText(de.error.moduleText)).toBeInTheDocument();
  });

  it("[WEB-14] the details are a disclosure with number, message, page, time, version and commit, and stay closed in a production build", async () => {
    vi.stubEnv("DEV", false);
    render(<ErrorScreen error={new Error("boom")} />);
    const disclosure = screen.getByText(de.error.details).closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    for (const label of [
      de.error.number,
      de.error.message,
      de.error.page,
      de.error.time,
      de.error.version,
      de.error.browser,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(await screen.findByText(/\(abc1234\)/)).toBeInTheDocument();
    expect(screen.getByText(de.error.noPersonalData)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it("[WEB-14] on the development server the details are open at once", () => {
    vi.stubEnv("DEV", true);
    render(<ErrorScreen error={new Error("boom")} />);
    expect(screen.getByText(de.error.details).closest("details")).toHaveAttribute("open");
    vi.unstubAllEnvs();
  });

  it("[WEB-14] 'Details kopieren' puts the details into the clipboard as plain text and sends nothing", async () => {
    vi.stubEnv("DEV", false);
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "test" });
    render(<ErrorScreen error={new Error("boom")} />);
    fireEvent.click(screen.getByRole("button", { name: de.error.copy }));
    await screen.findByText(de.error.copied);
    const text = writeText.mock.calls[0]?.[0] ?? "";
    expect(text).toContain(`${de.error.message}: boom`);
    expect(text).toContain(`${de.error.page}: ${window.location.pathname}`);
    expect(await screen.findByText(de.error.copied)).toBeInTheDocument();
    // The only request is the read of the version.
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    expect(urls.every((url) => url === "/api/version")).toBe(true);
    vi.unstubAllEnvs();
  });
});
