// The page above the paused game (GAME-11, UX mock game-overlay).
import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import Root from "../app/Root.tsx";
import { initI18n } from "../i18n/i18n.ts";
import { anna, fakeBackend, signedIn, user } from "../test/backend.tsx";
import GameOverlay from "./GameOverlay.tsx";
import type { Overlay } from "./GameOverlay.tsx";

beforeAll(async () => {
  await initI18n();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const programme = {
  hidden: false,
  eventDay: false,
  eventDate: "2027-06-12",
  items: [
    {
      id: 1,
      name: "Trauung",
      startsAt: "2027-06-12T10:00:00.000Z",
      endsAt: null,
      placeName: "Kirche Muri",
      status: "upcoming",
    },
  ],
};

function renderOverlay(overlay: Overlay, onClose: () => void) {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            element: <Root />,
            children: [{ path: "/", element: <GameOverlay overlay={overlay} onClose={onClose} /> }],
          },
        ],
        { initialEntries: ["/"] },
      )}
    />,
  );
}

describe("a page above the game (GAME-11)", () => {
  it("[GAME-11] an object's page opens as a dialog over the game, and closing it hands control back", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    const onClose = vi.fn();
    renderOverlay({ action: { kind: "page", page: "programme" }, label: "Programm" }, onClose);
    const dialog = await screen.findByRole("dialog", { name: "Programm" });
    expect(dialog).toBeVisible();
    expect(await screen.findByText("Trauung")).toBeVisible();
    expect(screen.getByText("II PAUSIERT")).toBeVisible();
    user.click(screen.getByRole("button", { name: "Schliessen" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[GAME-11] the Escape key closes the page", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    const onClose = vi.fn();
    renderOverlay({ action: { kind: "page", page: "programme" } }, onClose);
    await screen.findByRole("dialog");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[GAME-11] links inside the page stay in the overlay: a content page's link to Mehr opens Mehr there", async () => {
    fakeBackend({
      "GET /api/session": () => ({ status: 200, body: { user: anna, csrfToken: "csrf-1" } }),
      "GET /api/content": () => ({
        status: 200,
        body: {
          startMarkdown: "",
          pages: [
            {
              id: 1,
              slug: "anreise",
              title: "Anreise",
              markdown: "Mit dem Zug.",
              inMore: true,
              position: 0,
              placeIds: [],
            },
          ],
          places: [],
          start: { heroImageId: null, heroAlt: null, countdown: true },
        },
      }),
    });
    renderOverlay({ action: { kind: "page", page: "p/anreise" } }, vi.fn());
    expect(await screen.findByText("Mit dem Zug.")).toBeVisible();
    const [back] = screen.getAllByRole("link", { name: "Mehr" });
    if (!back) throw new Error("no link to Mehr");
    user.click(back);
    expect(await screen.findByRole("heading", { name: "Mehr" })).toBeVisible();
    // Still the same overlay, and the dialog is still open.
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("[GAME-06] an action that comes with a later stage shows a short note instead of a page", async () => {
    fakeBackend({ "GET /api/session": () => signedIn });
    renderOverlay({ action: { kind: "dialog", dialogId: "npc-pastor" }, label: "Pastor" }, vi.fn());
    expect(await screen.findByText("Das gibt es hier bald.")).toBeVisible();
  });
});
