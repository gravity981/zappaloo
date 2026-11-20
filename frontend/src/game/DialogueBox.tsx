// The dialogue box of the game (CNT-02, CNT-08; UX mock `admin-world`, preview of a dialogue): an NPC talks to the
// player. It stands at the bottom of the paused game with the portrait on the left, the NPC's name, one line in
// Markdown that types itself out (CNT-10) and "n / m" with an arrow that bounces once the page is complete. A tap
// anywhere on the game, Enter or Space completes a page that is still typing, then goes on; the last page closes
// it; Escape closes it at once (there is no cross: a guest who wants to leave taps through, or presses Escape). The game goes on where it stood.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dialogueGuestSchema } from "@zappaloo/shared";
import type { DialogueGuest } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { prefersReducedMotion } from "./reduced-motion.ts";
import TypedText from "./TypedText.tsx";

/**
 * A tap or key that comes this soon after the box opened still belongs to the action that opened it. The box says when
 * it takes taps (`data-settled`), so that a test waits for that state and not for the clock.
 */
const SETTLE_MS = 300;
/** A portrait up to this many pixels is pixel art and is scaled without smoothing. */
const PIXEL_ART_SIDE = 128;

export default function DialogueBox({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [dialogue, setDialogue] = useState<DialogueGuest>();
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  /** The index of the page whose whole text is shown; a page is done when it is the one in view (CNT-10). */
  const [doneIndex, setDoneIndex] = useState(-1);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [pixelated, setPixelated] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  /** Whether the box takes taps and keys yet; the ref is for the handlers, the state for `data-settled`. */
  const settled = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      settled.current = true;
      setReady(true);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void apiRequest("GET", `/api/dialogues/${id}`).then((result) => {
      if (cancelled) return;
      const parsed = dialogueGuestSchema.safeParse(result.body);
      if (result.ok && parsed.success) setDialogue(parsed.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The box takes the focus and gives it back; the keys Enter and Space go on, Escape closes.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  const last = dialogue === undefined || index >= dialogue.lines.length - 1;
  function next() {
    if (!settled.current) return;
    // A tap while the page types shows all of it first.
    if (doneIndex !== index && !reducedMotion) setDoneIndex(index);
    else if (last) onClose();
    else setIndex((current) => current + 1);
  }

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
        // The key that opened the dialogue must not also turn its first page.
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("keydown", keys);
    };
  });

  if (failed) {
    return (
      <div className="dialogue-layer" onClick={onClose}>
        <div className="dialogue-box" role="alert" ref={box} tabIndex={-1}>
          <span>{t("game.dialogue.failed")}</span>
          <button type="button" className="btn soft sm" onClick={onClose}>
            {t("game.dialogue.close")}
          </button>
        </div>
      </div>
    );
  }
  if (dialogue === undefined) return null;
  const line = dialogue.lines[index] ?? "";
  const done = reducedMotion || doneIndex === index;
  return (
    <div
      className="dialogue-layer"
      data-testid="dialogue-layer"
      data-settled={ready}
      data-typing={!done}
      onClick={() => {
        next();
      }}
    >
      <div
        className="dialogue-box"
        role="dialog"
        aria-label={dialogue.npcName}
        ref={box}
        tabIndex={-1}
        data-testid="dialogue-box"
        data-settled={ready}
      >
        {dialogue.portrait !== null && (
          <img
            className={pixelated ? "dialogue-portrait pixelated" : "dialogue-portrait"}
            src={`/api/dialogues/${dialogue.id}/portrait?v=${String(dialogue.portrait)}`}
            alt=""
            onLoad={(event) => {
              setPixelated(
                Math.max(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight) <=
                  PIXEL_ART_SIDE,
              );
            }}
          />
        )}
        <div className="dialogue-text">
          <b>{dialogue.npcName}</b>
          <TypedText
            key={index}
            text={line}
            complete={done}
            onDone={() => {
              setDoneIndex(index);
            }}
          />
          <span className="hint dialogue-step">
            {t("game.dialogue.step", { n: index + 1, count: dialogue.lines.length })}
            <span className="visually-hidden">
              {" · "}
              {last ? t("game.dialogue.tapClose") : t("game.dialogue.tapNext")}
            </span>
            <span className="dialogue-next" aria-hidden="true" data-visible={done}>
              &gt;
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
