import { render, screen } from "@testing-library/react";
import i18n from "i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import { routes } from "../app/routes.tsx";
import { DEFAULT_LANGUAGE, initI18n, resources, SUPPORTED_LANGUAGES } from "./i18n.ts";
import de from "./locales/de/common.json";

beforeAll(async () => {
  await initI18n();
});

function renderAt(path: string) {
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

  it("[LANG-01] pages show their texts from the German message file", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(de.home.title);
    expect(screen.getByText(de.home.placeholder)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: de.nav.game })).toBeInTheDocument();
  });

  it("[LANG-01] the not-found page is translated too", () => {
    renderAt("/does-not-exist");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(de.notFound.title);
    expect(screen.getByRole("link", { name: de.notFound.backHome })).toHaveAttribute("href", "/");
  });
});
