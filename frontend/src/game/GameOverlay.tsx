// A page above the paused game (GAME-11, UX mock `game-overlay`): the website page that an object's action names,
// shown in a sheet over the game. Links inside stay in the overlay: it has a router of its own, so the address of
// the browser does not change and closing it returns the player to the same spot. A router cannot sit inside the
// app's router, so the page is rendered into a React root of its own, with the session and the event it needs. The
// action `dialog` (step 6d) comes later; until then it shows a short note.
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { MemoryRouter, useRoutes } from "react-router";
import type { WorldObjectAction } from "@zappaloo/shared";
import { EventProvider } from "../app/EventProvider.tsx";
import { SessionProvider } from "../app/SessionProvider.tsx";
import AvatarPage from "../pages/AvatarPage.tsx";
import ContentPage from "../pages/ContentPage.tsx";
import MorePage from "../pages/MorePage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import ProfilePage from "../pages/ProfilePage.tsx";
import ProgrammePage from "../pages/ProgrammePage.tsx";
import RsvpPage from "../pages/RsvpPage.tsx";

/** What the overlay shows: the action of the activated object and its label. */
export interface Overlay {
  action: WorldObjectAction;
  label?: string;
}

/** Closes the overlay when the page it shows leaves to the start page (the RSVP does, when it is done). */
function CloseOnHome({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    onClose();
  }, [onClose]);
  return null;
}

/** The pages an overlay can show, with a router of its own. */
function OverlayRoutes({ onClose }: { onClose: () => void }) {
  return useRoutes([
    { index: true, element: <CloseOnHome onClose={onClose} /> },
    { path: "programme", element: <ProgrammePage /> },
    { path: "p/:slug", element: <ContentPage /> },
    { path: "mehr", element: <MorePage /> },
    { path: "profile", element: <ProfilePage /> },
    { path: "avatar", element: <AvatarPage /> },
    { path: "rsvp", element: <RsvpPage /> },
    { path: "*", element: <NotFoundPage /> },
  ]);
}

/** The page of an overlay, in a React root of its own with a router of its own. */
function OverlayPage({ page, onClose }: { page: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const root = createRoot(element);
    root.render(
      <SessionProvider>
        <EventProvider>
          <MemoryRouter initialEntries={[`/${page}`]}>
            <div className="guest">
              <OverlayRoutes onClose={onClose} />
            </div>
          </MemoryRouter>
        </EventProvider>
      </SessionProvider>,
    );
    return () => {
      // Not while React is still rendering the tree this effect belongs to.
      setTimeout(() => {
        root.unmount();
      }, 0);
    };
  }, [page, onClose]);
  return <div ref={host} />;
}

export default function GameOverlay({
  overlay,
  onClose,
}: {
  overlay: Overlay;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { action } = overlay;
  const page = action.kind === "page" ? action.page : undefined;
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  return (
    <div className="game-overlay" data-testid="game-overlay">
      <span className="game-paused">{t("game.overlay.paused")}</span>
      <div
        className="game-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={overlay.label ?? t("game.overlay.title")}
      >
        <div className="game-sheet-head">
          <b>{overlay.label ?? t("game.overlay.title")}</b>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            {t("game.overlay.close")}
          </button>
        </div>
        <div className="game-sheet-body">
          {page === undefined ? (
            <p>{t("game.overlay.comingSoon")}</p>
          ) : (
            <OverlayPage page={page} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
