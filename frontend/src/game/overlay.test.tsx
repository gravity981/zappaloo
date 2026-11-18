// The page above the paused game (GAME-11, UX mock game-overlay).
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
  eventDay: false,
  eventDate: "2027-06-12",
  items: [
    {
      id: 1,
      name: "Trauung",
      programItemId: 1,
      startsAt: "2027-06-12T10:00:00.000Z",
      endsAt: null,
      placeName: "Kirche Muri",
      status: "upcoming",
      day: "2027-06-12",
    },
  ],
};

function renderOverlay(
  overlay: Overlay,
  onClose: () => void,
  onLeave: (path: string) => void = vi.fn(),
  strict = false,
) {
  const app = (
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            element: <Root />,
            children: [
              {
                path: "/",
                element: <GameOverlay overlay={overlay} onClose={onClose} onLeave={onLeave} />,
              },
            ],
          },
        ],
        { initialEntries: ["/"] },
      )}
    />
  );
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}

/** The markdown of a content page with one link; the page is the one the overlay opens for `p/anreise`. */
function contentWithLink(markdown: string) {
  return {
    status: 200,
    body: {
      startMarkdown: "",
      pages: [
        {
          id: 1,
          slug: "anreise",
          title: "Anreise",
          markdown,
          inMore: true,
          position: 0,
          placeIds: [],
        },
      ],
      places: [],
      start: { heroImageId: null, heroAlt: null, countdown: true },
    },
  };
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

  it("[GAME-11] a link to a page of the website in a content page opens that page in the overlay; the address of the browser stays", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => contentWithLink("Der [Ablauf](/programme) steht fest."),
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    const address = window.location.href;
    renderOverlay({ action: { kind: "page", page: "p/anreise" } }, vi.fn());
    user.click(await screen.findByRole("link", { name: "Ablauf" }));
    expect(await screen.findByText("Trauung")).toBeVisible();
    expect(window.location.href).toBe(address);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("[GAME-11] a link to another site opens in a new window and leaves the game where it is", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/content": () => contentWithLink("Mehr dazu [hier](https://example.org/info)."),
    });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderOverlay({ action: { kind: "page", page: "p/anreise" } }, vi.fn());
    user.click(await screen.findByRole("link", { name: "hier" }));
    expect(open).toHaveBeenCalledWith("https://example.org/info", "_blank", "noopener,noreferrer");
    expect(screen.getByRole("dialog")).toBeVisible();
    open.mockRestore();
  });

  it("[GAME-11] signing out in the overlay closes it and leads to the login page", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "DELETE /api/session": () => ({ status: 204 }),
    });
    const onLeave = vi.fn();
    renderOverlay({ action: { kind: "page", page: "profile" } }, vi.fn(), onLeave);
    user.click(await screen.findByRole("button", { name: "Ausloggen" }));
    await vi.waitFor(() => {
      expect(onLeave).toHaveBeenCalledWith("/login");
    });
  });

  it("[GAME-11] the overlay uses the app's session: the session is requested once, by the app", async () => {
    const calls = fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    renderOverlay({ action: { kind: "page", page: "programme" } }, vi.fn());
    expect(await screen.findByText("Trauung")).toBeVisible();
    expect(calls.filter((call) => call.path === "/api/session")).toHaveLength(1);
  });

  it("[GAME-11] the focus moves into the sheet when it opens and returns to the element that had it when it closes", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const { unmount } = renderOverlay({ action: { kind: "page", page: "programme" } }, vi.fn());
    await screen.findByText("Trauung");
    expect(screen.getByRole("button", { name: "Schliessen" })).toHaveFocus();
    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("[GAME-11] Escape in a text field of the page does not close the overlay; Escape outside a field does", async () => {
    fakeBackend({ "GET /api/session": () => signedIn });
    const onClose = vi.fn();
    renderOverlay({ action: { kind: "page", page: "profile" } }, onClose);
    const field = (await screen.findAllByRole("textbox"))[0];
    if (!field) throw new Error("the profile has no text field");
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[GAME-11] the page opens in StrictMode without a console error", async () => {
    fakeBackend({
      "GET /api/session": () => signedIn,
      "GET /api/programme": () => ({ status: 200, body: programme }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderOverlay({ action: { kind: "page", page: "programme" } }, vi.fn(), vi.fn(), true);
    expect(await screen.findByText("Trauung")).toBeVisible();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
