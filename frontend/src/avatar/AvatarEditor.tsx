// The avatar editor (sw-architecture.md 7.3, AVA-01, AVA-02; UX mock `onboard-avatar`): first the kind of figure,
// then a figure of that kind. Choosing a kind picks a random figure of it at once; "Zufällig" draws again within
// the kind. A tab per person: the user and every approved companion. Every choice is stored at once, so "Weiter"
// can wait until every person has a figure.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { avatarResponseSchema } from "@zappaloo/shared";
import type { AvatarResponse } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { loadFigureArt } from "./figure-art.ts";
import type { FigureArt } from "./figure-art.ts";
import { drawFigure, KINDS } from "./draw.ts";
import type { Kind } from "./draw.ts";
import { FigureImage, FigurePreview } from "./FigurePreview.tsx";

export default function AvatarEditor({
  continueLabel,
  continueWaiting = false,
  onContinue,
}: {
  continueLabel: string;
  /** Holds "Weiter" back while something it leads to is not known yet (the RSVP state, GAME-13). */
  continueWaiting?: boolean;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const { csrfToken } = useSession();
  const [data, setData] = useState<AvatarResponse>();
  const [art, setArt] = useState<Map<string, FigureArt>>();
  const [failed, setFailed] = useState(false);
  /** A choice that the server refused or could not store; the editor stays, with the message beside the grid. */
  const [saveError, setSaveError] = useState(false);
  /** A choice in flight: no second choice starts until it has been answered. */
  const saving = useRef(false);
  const [who, setWho] = useState("me");
  /** The kind a person has picked in this session, before or after the figure; else the kind of the figure. */
  const [kinds, setKinds] = useState<Record<string, Kind>>({});

  useEffect(() => {
    let cancelled = false;
    void apiRequest("GET", "/api/avatar").then((result) => {
      const parsed = avatarResponseSchema.safeParse(result.body);
      if (cancelled) return;
      if (result.ok && parsed.success) setData(parsed.data);
      else setFailed(true);
    });
    loadFigureArt().then(
      (loaded) => {
        if (!cancelled) setArt(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p role="alert">{t("avatar.loadFailed")}</p>;
  if (!data || !art) return <p>{t("avatar.loading")}</p>;
  const person = data.persons.find((item) => item.id === who) ?? data.persons[0];
  if (!person) return null;
  if (person.figures.length === 0) return <p>{t("avatar.noFigures")}</p>;

  const kindsOffered = KINDS.filter((kind) =>
    person.figures.some((figure) => figure.type === kind),
  );
  const current = person.chosen ? person.figure : null;
  const currentKind: Kind | undefined =
    kinds[person.id] ?? person.figures.find((figure) => figure.id === current)?.type;
  const pool =
    currentKind === undefined ? [] : person.figures.filter((f) => f.type === currentKind);

  async function choose(figure: string) {
    if (saving.current) return;
    saving.current = true;
    setSaveError(false);
    try {
      const result = await apiRequest("PUT", `/api/avatar/${person?.id ?? "me"}`, {
        csrfToken,
        body: { figure },
      });
      const parsed = avatarResponseSchema.safeParse(result.body);
      if (result.ok && parsed.success) setData(parsed.data);
      else setSaveError(true);
    } finally {
      saving.current = false;
    }
  }
  function pickKind(kind: Kind) {
    if (!person || kind === currentKind) return;
    setKinds((previous) => ({ ...previous, [person.id]: kind }));
    const figure = drawFigure(person.figures, kind, null);
    if (figure !== undefined) void choose(figure);
  }
  const everyoneChosen = data.persons.every((item) => item.chosen);
  const shown = current === null ? undefined : art.get(current);

  return (
    <div className="avatar-root">
      <div className="chips" role="group" aria-label={t("avatar.persons")}>
        {data.persons.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chip"
            aria-pressed={item.id === person.id}
            onClick={() => {
              setWho(item.id);
            }}
          >
            {item.name}
            {item.chosen && <span aria-label={t("avatar.done")}>{t("avatar.check")}</span>}
          </button>
        ))}
      </div>
      <div className="avatar-editor">
        <div className="stack">
          <div className="avatar-stage">
            {shown ? (
              <FigurePreview key={shown.stand} art={shown} />
            ) : (
              <span className="hint">{t("avatar.chooseKindFirst")}</span>
            )}
          </div>
          <button
            type="button"
            className="btn soft sm avatar-random"
            disabled={current === null || pool.length < 2 || currentKind === undefined}
            onClick={() => {
              const figure =
                currentKind === undefined
                  ? undefined
                  : drawFigure(person.figures, currentKind, current);
              if (figure !== undefined) void choose(figure);
            }}
          >
            {t("avatar.random")}
          </button>
        </div>
        <div className="stack">
          <div className="field">
            <span>{t("avatar.kind")}</span>
            <div className="chips" role="group" aria-label={t("avatar.kind")}>
              {kindsOffered.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="chip"
                  aria-pressed={kind === currentKind}
                  onClick={() => {
                    pickKind(kind);
                  }}
                >
                  {t(`avatar.kinds.${kind}`)}
                </button>
              ))}
            </div>
          </div>
          {current !== null && (
            <div className="field">
              <span>{t("avatar.figure")}</span>
              {saveError && <p role="alert">{t("avatar.saveFailed")}</p>}
              <div className="figure-grid" role="group" aria-label={t("avatar.figure")}>
                {pool.map((figure) => (
                  <button
                    key={figure.id}
                    type="button"
                    className="figure"
                    aria-pressed={figure.id === current}
                    aria-label={figure.label ?? t("avatar.unnamed")}
                    onClick={() => {
                      void choose(figure.id);
                    }}
                  >
                    <FigureImage url={art.get(figure.id)?.stand} />
                    {figure.label !== undefined && <small>{figure.label}</small>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <span className="hint">
            {current === null ? t("avatar.hintKind") : t("avatar.hintFigure")}
          </span>
        </div>
      </div>
      {!everyoneChosen && <p className="hint">{t("avatar.everyone")}</p>}
      <button
        type="button"
        className="btn"
        disabled={!everyoneChosen || continueWaiting}
        onClick={onContinue}
      >
        {continueLabel}
      </button>
    </div>
  );
}
