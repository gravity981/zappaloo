// The dialogue box of the game (CNT-02, CNT-08; UX mock `admin-world`, preview of a dialogue): an NPC talks to the
// player. It stands at the bottom of the paused game with the portrait on the left, the NPC's name, one line in
// Markdown and "n / m · Tippen für weiter". A tap anywhere on the game, Enter or Space goes on, the last one closes
// it; its cross and Escape close it at once. The game goes on where it stood.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dialogueGuestSchema } from "@zappaloo/shared";
import type { DialogueGuest } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import Markdown from "../app/Markdown.tsx";

/** A tap or key that comes this soon after the box opened still belongs to the action that opened it. */
const SETTLE_MS = 300;
/** A portrait up to this many pixels is pixel art and is scaled without smoothing. */
const PIXEL_ART_SIDE = 128;

export default function DialogueBox({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [dialogue, setDialogue] = useState<DialogueGuest>();
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [pixelated, setPixelated] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    openedAt.current = Date.now();
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
    if (Date.now() - openedAt.current < SETTLE_MS) return;
    if (last) onClose();
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
  return (
    <div
      className="dialogue-layer"
      data-testid="dialogue-layer"
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
          <Markdown text={line} />
          <span className="hint dialogue-step">
            {t("game.dialogue.step", { n: index + 1, count: dialogue.lines.length })}
            {" · "}
            {last ? t("game.dialogue.tapClose") : t("game.dialogue.tapNext")}
          </span>
        </div>
        <button
          type="button"
          className="dialogue-close"
          aria-label={t("game.dialogue.close")}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          {t("game.dialogue.closeSign")}
        </button>
      </div>
    </div>
  );
}
