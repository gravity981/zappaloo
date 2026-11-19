// The game page (GAME-12 – GAME-14, GAME-17, GAME-18; UX mocks `game`, `onboard-avatar`). On the first entry the
// guest first chooses the avatar of everybody who has none (the same editor as in the profile), then answers the
// RSVP in an overlay if it is still open, then plays freely. In the game: the bar at the top, the hint until the
// first object is used, and a tap on the own avatar opens the profile. Pages open as an overlay above the paused game.
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { rsvpStateSchema } from "@zappaloo/shared";
import AvatarEditor from "../avatar/AvatarEditor.tsx";
import { apiRequest } from "../app/api.ts";
import { useFeature } from "../app/event.ts";
import { useSession } from "../app/session.ts";
import { hintSeen, markHintSeen, useFirstEntry, useWorldActive } from "../app/gameEntry.ts";
import ProfileEditor from "../profile/ProfileEditor.tsx";
import GameBar from "../game/GameBar.tsx";
import GameHint from "../game/GameHint.tsx";
import DialogueBox from "../game/DialogueBox.tsx";
import GameOverlay from "../game/GameOverlay.tsx";
import type { Overlay } from "../game/GameOverlay.tsx";
import { rsvpUnanswered } from "../rsvp/landing.ts";

const RSVP_PAGE = "rsvp";
const PROFILE_PAGE = "profile";

// Phaser is only downloaded when the game is opened, so the website stays light.
const GameCanvas = lazy(() => import("../game/GameCanvas.tsx"));

/** Whether the guest's RSVP is not answered yet: undefined while unknown or when the guest does not answer. */
function useRsvpOpen(enabled: boolean, reload: unknown): boolean | undefined {
  const [open, setOpen] = useState<boolean>();
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void apiRequest("GET", "/api/rsvp").then((result) => {
      if (cancelled) return;
      const parsed = rsvpStateSchema.safeParse(result.body);
      // A failed request is an answer of "no RSVP to do" here: the guest is not held back by it.
      setOpen(result.ok && parsed.success ? rsvpUnanswered(parsed.data) : false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, reload]);
  return enabled ? open : undefined;
}

export default function GamePage() {
  const { t } = useTranslation();
  const session = useSession();
  const rsvpEnabled = useFeature("rsvp") && (session.user?.roles.includes("vip") ?? false);
  const world = useWorldActive(true);
  const [firstEntry, finishEntry] = useFirstEntry();
  const [overlay, setOverlay] = useState<Overlay>();
  /** The id of the dialogue an NPC or object shows in the dialogue box (CNT-02), if one is open. */
  const [dialogue, setDialogue] = useState<string>();
  const [hint, setHint] = useState(() => !hintSeen());
  const rsvpOpen = useRsvpOpen(rsvpEnabled, overlay);
  /** The second step of the first entry, "Sag hallo": the profile of a guest (GAME-13, PRES-09). */
  const [hello, setHello] = useState(false);
  const isVip = session.user?.roles.includes("vip") ?? false;

  const openPage = useCallback((page: string, label: string) => {
    setOverlay({ action: { kind: "page", page }, label });
  }, []);
  const navigate = useNavigate();
  // A page of the overlay that leaves the game (a sign-out ends in the login) closes it and goes there.
  const leaveOverlay = useCallback(
    (path: string) => {
      setOverlay(undefined);
      void navigate(path);
    },
    [navigate],
  );
  const closeOverlay = useCallback(() => {
    setOverlay(undefined);
  }, []);

  // Without a world, or with guest access off, a guest has no game: the website is the way (MAP-19).
  if (world === false) return <Navigate to="/" replace />;
  if (world === undefined || firstEntry === undefined) return <p>{t("game.loading")}</p>;
  // Right after the first-entry steps, the RSVP opens in an overlay if it is not answered yet (GAME-13).
  const finishFirstEntry = () => {
    finishEntry();
    if (rsvpOpen === true) openPage(RSVP_PAGE, t("nav.rsvp"));
  };
  if (firstEntry && hello) {
    return (
      <section className="game-first guest avatar-page">
        <h1 className="h1">{t("game.first.hello.title")}</h1>
        <p className="hint">{t("profileCard.text")}</p>
        <ProfileEditor />
        <div className="rsvp-actions">
          <button type="button" className="btn ghost" onClick={finishFirstEntry}>
            {t("game.first.hello.skip")}
          </button>
          <button type="button" className="btn" onClick={finishFirstEntry}>
            {t("game.first.hello.go")}
          </button>
        </div>
      </section>
    );
  }
  if (firstEntry) {
    return (
      <section className="game-first guest avatar-page">
        <h1 className="h1">{t("avatar.title")}</h1>
        <AvatarEditor
          continueLabel={t("game.first.continue")}
          // "Weiter" waits for the RSVP state, so that the RSVP overlay can open right after it (GAME-13).
          continueWaiting={rsvpEnabled && rsvpOpen === undefined}
          onContinue={() => {
            // A guest says hello next; staff and admins have no profile and go on.
            if (isVip) setHello(true);
            else finishFirstEntry();
          }}
        />
      </section>
    );
  }

  return (
    <div className="game-page">
      <div className="game-window guest">
        <GameBar />
        <div className="game-stage">
          <Suspense fallback={<p>{t("game.loading")}</p>}>
            <GameCanvas
              paused={overlay !== undefined || dialogue !== undefined}
              onActivate={(activation) => {
                markHintSeen();
                setHint(false);
                // A dialogue is not a page: its box stands over the game, which waits (CNT-02).
                if (activation.action.kind === "dialog") {
                  setDialogue(activation.action.dialogId);
                  return;
                }
                setOverlay({
                  action: activation.action,
                  ...(activation.label === undefined ? {} : { label: activation.label }),
                });
              }}
              onPlayerTap={() => {
                openPage(PROFILE_PAGE, t("nav.profile"));
              }}
            />
          </Suspense>
          {hint && overlay === undefined && dialogue === undefined && <GameHint />}
          {dialogue !== undefined && (
            <DialogueBox
              id={dialogue}
              onClose={() => {
                setDialogue(undefined);
              }}
            />
          )}
        </div>
      </div>
      {overlay && <GameOverlay overlay={overlay} onClose={closeOverlay} onLeave={leaveOverlay} />}
    </div>
  );
}
