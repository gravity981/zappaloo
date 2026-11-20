// A page above the paused game (GAME-11, UX mock `game-overlay`): the website page that an object's action names,
// shown in a sheet over the game. Links inside stay in the overlay: it has a router of its own, so the address of
// the browser does not change and closing it returns the player to the same spot. A link to another site opens in a
// new window. A router cannot sit inside the app's router, so the page is rendered into a React root of its own, with
// the session and the event of the app. The sheet takes the focus while it is open; the game stands still behind it.
// The action `dialog` is not a page: the dialogue box of the game shows it (DialogueBox, CNT-02).
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { MemoryRouter, useNavigate, useRoutes, type NavigateFunction } from "react-router";
import type { WorldObjectAction } from "@zappaloo/shared";
import { EventContext, SetEventContext, useEvent, useSetEvent } from "../app/event.ts";
import { SessionContext, useSession } from "../app/session.ts";
import AvatarPage from "../pages/AvatarPage.tsx";
import ContentPage from "../pages/ContentPage.tsx";
import MorePage from "../pages/MorePage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import ProfilePage from "../pages/ProfilePage.tsx";
import ProgrammePage from "../pages/ProgrammePage.tsx";
import SeatingPage from "../pages/SeatingPage.tsx";
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

/** Leaves the game for a page of the website (the login): the overlay closes and the app goes there. */
function LeaveToPage({ to, onLeave }: { to: string; onLeave: (path: string) => void }) {
  useEffect(() => {
    onLeave(to);
  }, [to, onLeave]);
  return null;
}

/** The pages an overlay can show, with a router of its own. */
function OverlayRoutes({
  onClose,
  onLeave,
}: {
  onClose: () => void;
  onLeave: (path: string) => void;
}) {
  return useRoutes([
    { index: true, element: <CloseOnHome onClose={onClose} /> },
    { path: "programme", element: <ProgrammePage /> },
    { path: "seating", element: <SeatingPage /> },
    { path: "p/:slug", element: <ContentPage /> },
    { path: "mehr", element: <MorePage /> },
    { path: "profile", element: <ProfilePage /> },
    { path: "avatar", element: <AvatarPage /> },
    { path: "rsvp", element: <RsvpPage /> },
    // A sign-out in the profile ends in the login page, which is outside the game.
    { path: "login", element: <LeaveToPage to="/login" onLeave={onLeave} /> },
    { path: "*", element: <NotFoundPage /> },
  ]);
}

/** Hands the navigate function of the overlay's router out, so a click on a link can use it. */
function NavigateHandle({ onReady }: { onReady: (navigate: NavigateFunction) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    onReady(navigate);
  }, [navigate, onReady]);
  return null;
}

/** Whether the target is a field that takes typed keys (Escape is the field's then, not the sheet's). */
function isField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * A click on a link of the page: a link inside the website stays in the overlay; a link to another site opens in
 * a new window. Clicks with a modifier key keep the browser's own meaning.
 */
function followLink(
  event: ReactMouseEvent<HTMLDivElement>,
  navigate: NavigateFunction | undefined,
) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return;
  const url = new URL(link.href);
  event.preventDefault();
  if (url.origin === window.location.origin) {
    void navigate?.(`${url.pathname}${url.search}${url.hash}`);
  } else {
    window.open(url.href, "_blank", "noopener,noreferrer");
  }
}

/** The page of an overlay, in a React root of its own with a router of its own. */
function OverlayPage({
  page,
  onClose,
  onLeave,
}: {
  page: string;
  onClose: () => void;
  onLeave: (path: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<Root | undefined>(undefined);
  const navigate = useRef<NavigateFunction | undefined>(undefined);
  const session = useSession();
  const event = useEvent();
  const setEvent = useSetEvent();
  const handOutNavigate = useCallback((fn: NavigateFunction) => {
    navigate.current = fn;
  }, []);

  // One root per page, kept across StrictMode's mount, unmount and mount of this effect. It is unmounted later, when
  // React has finished the tree this effect belongs to, and only if the page is still gone then.
  const mounted = useRef(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    mounted.current = true;
    root.current ??= createRoot(element);
    return () => {
      mounted.current = false;
      setTimeout(() => {
        const current = root.current;
        if (mounted.current || current === undefined) return;
        root.current = undefined;
        current.unmount();
      }, 0);
    };
  }, []);

  // The sheet paints first and the page is rendered two frames later, so the first frame of the overlay does not wait
  // for the page to render (GAME-44).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  // The page follows the app's session and event; a change renders the same root again.
  useEffect(() => {
    if (!ready) return;
    root.current?.render(
      <SessionContext.Provider value={session}>
        <EventContext.Provider value={event}>
          <SetEventContext.Provider value={setEvent}>
            <MemoryRouter initialEntries={[`/${page}`]}>
              <NavigateHandle onReady={handOutNavigate} />
              <OverlayRoutes onClose={onClose} onLeave={onLeave} />
            </MemoryRouter>
          </SetEventContext.Provider>
        </EventContext.Provider>
      </SessionContext.Provider>,
    );
  }, [ready, page, session, event, setEvent, onClose, onLeave, handOutNavigate]);

  return (
    <div
      ref={host}
      onClick={(click) => {
        followLink(click, navigate.current);
      }}
    />
  );
}

export default function GameOverlay({
  overlay,
  onClose,
  onLeave,
}: {
  overlay: Overlay;
  onClose: () => void;
  onLeave: (path: string) => void;
}) {
  const { t } = useTranslation();
  const frame = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const { action } = overlay;
  const page = action.kind === "page" ? action.page : undefined;

  // The sheet takes the focus; the game window behind it is inert, so Tab does not reach it; the focus goes back
  // to the element that had it when the overlay closes.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const game = frame.current?.parentElement?.querySelector<HTMLElement>(".game-window");
    game?.setAttribute("inert", "");
    // No scrolling to the button: on iOS a focus that scrolls makes the sheet jump while it opens.
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      game?.removeAttribute("inert");
      previous?.focus();
    };
  }, []);

  // Escape closes the overlay, except while a field of the page has the key (a wizard's input is not lost).
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isField(event.target)) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div className="game-overlay" data-testid="game-overlay" ref={frame}>
      <span className="game-paused" aria-hidden="true">
        {t("game.overlay.paused")}
      </span>
      <div
        className="game-sheet guest"
        role="dialog"
        aria-modal="true"
        aria-label={overlay.label ?? t("game.overlay.title")}
      >
        <div className="game-sheet-head">
          <b>{overlay.label ?? t("game.overlay.title")}</b>
          <button ref={closeButton} type="button" className="btn ghost sm" onClick={onClose}>
            {t("game.overlay.close")}
          </button>
        </div>
        <div className="game-sheet-body">
          {page === undefined ? (
            <p>{t("game.overlay.comingSoon")}</p>
          ) : (
            <OverlayPage key={page} page={page} onClose={onClose} onLeave={onLeave} />
          )}
        </div>
      </div>
    </div>
  );
}
