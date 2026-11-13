import { render, screen } from "@testing-library/react";
import i18n from "i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { routes } from "../app/routes.tsx";
import { DEFAULT_LANGUAGE, initI18n, resources, SUPPORTED_LANGUAGES } from "./i18n.ts";
import de from "./locales/de/common.json";

beforeAll(async () => {
  await initI18n();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The pages need a signed-in user (ACS-09): a fake backend with a session. */
function renderAt(path: string) {
  const user = {
    id: 1,
    username: "anna",
    displayName: "Anna",
    email: null,
    emailStatus: "unverified",
    roles: ["vip"],
    capabilities: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url === "/api/session"
          ? Response.json({ user, csrfToken: "csrf" })
          : Response.json({ error: { code: "not_found", message: "?" } }, { status: 404 }),
      ),
    ),
  );
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe("i18n", () => {
  it("[LANG-01] German is the default and, for now, the only UI language", () => {
    expect(DEFAULT_LANGUAGE).toBe("de");
    expect(SUPPORTED_LANGUAGES).toEqual(["de"]);
    expect(Object.keys(resources)).toEqual(["de"]);
    expect(i18n.language).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("[LANG-01] pages show their texts from the German message file", async () => {
    renderAt("/");
    expect(await screen.findByRole("link", { name: de.nav.more })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: de.nav.game })).toBeInTheDocument();
  });

  it("[LANG-01] the not-found page is translated too", async () => {
    renderAt("/does-not-exist");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(de.notFound.title);
    expect(screen.getByRole("link", { name: de.notFound.backHome })).toHaveAttribute("href", "/");
  });
});
