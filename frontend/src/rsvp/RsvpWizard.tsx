// The RSVP wizard (sw-architecture.md 7.4, 7.4.1; UX mocks rsvp-parts, rsvp-people,
// rsvp-companion, rsvp-done): attendance → food and allergies → song wish, then a summary.
// Declining every part skips to the summary. After the deadline the summary is read-only. The
// same wizard runs in admin mode for a guest (RSVP-04): the deadline does not apply there.
import "../admin/admin.css";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { rsvpStateSchema } from "@zappaloo/shared";
import type { RsvpAnswerRequest, RsvpState } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useAdminData, useErrorText } from "../admin/data.ts";
import { useEventFormat } from "./format.ts";

type Mode = { kind: "guest" } | { kind: "admin"; userId: number };
type Step = 1 | 2 | 3 | "summary";

const TOTAL_STEPS = 3;

/** Loads the guest's RSVP; the form below starts from it and is rebuilt after each save. */
export default function RsvpWizard({ mode, onFinish }: { mode: Mode; onFinish?: () => void }) {
  const errorText = useErrorText();
  const path =
    mode.kind === "admin" ? `/api/admin/rsvp/guests/${String(mode.userId)}` : "/api/rsvp";
  const { data, failed } = useAdminData(path, rsvpStateSchema);
  /** The state a save answered with; it replaces the loaded one. */
  const [saved, setSaved] = useState<{ path: string; state: RsvpState }>();
  const state = saved?.path === path ? saved.state : data;
  if (failed) {
    return (
      <p role="alert" className="error">
        {errorText(failed)}
      </p>
    );
  }
  if (!state) return null;
  return (
    <WizardForm
      key={`${path}-${state.answer?.answeredAt ?? "new"}`}
      mode={mode}
      path={path}
      state={state}
      onSaved={(next) => {
        setSaved({ path, state: next });
      }}
      {...(onFinish ? { onFinish } : {})}
    />
  );
}

function WizardForm({
  mode,
  path,
  state,
  onSaved,
  onFinish,
}: {
  mode: Mode;
  path: string;
  state: RsvpState;
  onSaved: (state: RsvpState) => void;
  onFinish?: () => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const format = useEventFormat();
  const answer = state.answer;
  const [step, setStep] = useState<Step>(answer ? "summary" : 1);
  const [attendance, setAttendance] = useState<Record<number, boolean>>(() =>
    answer
      ? Object.fromEntries(
          state.parts.map((part) => [part.id, answer.attendingPartIds.includes(part.id)]),
        )
      : {},
  );
  const [menuId, setMenuId] = useState<number | null>(answer?.menuId ?? null);
  const [allergies, setAllergies] = useState(answer?.allergies ?? "");
  const [songWish, setSongWish] = useState(answer?.songWish ?? "");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  const admin = mode.kind === "admin";
  const locked = state.closed && !admin;
  const mealPart = state.parts.find((part) => part.hasMeal);
  const attendingIds = state.parts.filter((part) => attendance[part.id]).map((part) => part.id);
  const answeredAll = state.parts.every((part) => attendance[part.id] !== undefined);
  const attendsMeal = mealPart !== undefined && attendingIds.includes(mealPart.id);
  const needsMenu = attendsMeal && state.menus.length > 0;

  async function submit() {
    setSending(true);
    const body: RsvpAnswerRequest = {
      attendance: state.parts.map((part) => ({
        partId: part.id,
        attending: attendance[part.id] === true,
      })),
      ...(attendingIds.length > 0
        ? {
            ...(needsMenu && menuId !== null ? { menuId } : {}),
            allergies: allergies.trim() === "" ? null : allergies.trim(),
            songWish: songWish.trim() === "" ? null : songWish.trim(),
          }
        : {}),
    };
    const result = await apiRequest("PUT", path, { body, csrfToken: session.csrfToken });
    setSending(false);
    const parsed = rsvpStateSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setError(undefined);
      onSaved(parsed.data);
    } else {
      setError(errorText(result.errorCode ?? "unknown"));
    }
  }

  const header = (current: number) => (
    <>
      <span className="rsvp-step">{t("rsvp.step", { current, total: TOTAL_STEPS })}</span>
      {admin && <p className="hint">{t("rsvp.adminMode")}</p>}
    </>
  );
  const alert = error && (
    <p role="alert" className="error">
      {error}
    </p>
  );
  const deadline = state.deadline && (
    <p className="muted sm">{t("rsvp.deadline", { date: format.day(state.deadline) })}</p>
  );

  // --- Summary ---------------------------------------------------------------------------
  if (step === "summary" || (locked && !state.answer)) {
    const attending = answer ? answer.attendingPartIds.length > 0 : false;
    return (
      <div className="stack">
        {admin && <p className="hint">{t("rsvp.adminMode")}</p>}
        {answer ? (
          <h1 className="h1">
            {attending
              ? t("rsvp.done", { name: state.name })
              : t("rsvp.declined", { name: state.name })}
          </h1>
        ) : (
          <h1 className="h1">{t("rsvp.notAnswered")}</h1>
        )}
        {answer && (
          <>
            <div className="card">
              <ul className="list">
                {state.parts.map((part) => (
                  <li key={part.id} className="li">
                    <b className="grow">{part.name}</b>
                    <span className={answer.attendingPartIds.includes(part.id) ? "tag ok" : "tag"}>
                      {answer.attendingPartIds.includes(part.id)
                        ? t("rsvp.attending")
                        : t("rsvp.notAttending")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {attending && (
              <div className="card">
                <ul className="list">
                  <li className="li">
                    <div className="grow">
                      <b>{state.name}</b>
                      <span className="muted sm">
                        {[
                          state.menus.find((menu) => menu.id === answer.menuId)?.name,
                          answer.allergies ? t("rsvp.allergiesGiven") : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </li>
                  {answer.songWish && (
                    <li className="li">
                      <div className="grow">
                        <b>{t("rsvp.songWish")}</b>
                        <span className="muted sm">{answer.songWish}</span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}
        {locked ? (
          <div className="card flat sm">{t("rsvp.closed")}</div>
        ) : (
          state.deadline && (
            <p className="muted sm">{t("rsvp.editUntil", { date: format.day(state.deadline) })}</p>
          )
        )}
        <div className="rsvp-actions">
          {!locked && state.parts.length > 0 && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setStep(1);
              }}
            >
              {t("rsvp.change")}
            </button>
          )}
          {onFinish && (
            <button type="button" className="btn" onClick={onFinish}>
              {t("rsvp.finish")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Step 1: attendance ------------------------------------------------------------------
  if (step === 1) {
    return (
      <div className="stack">
        {header(1)}
        <h1 className="h1">{t("rsvp.greeting", { name: state.name })}</h1>
        {state.parts.length === 0 ? (
          <p className="muted">{t("rsvp.noParts")}</p>
        ) : (
          <>
            <p className="muted">{t("rsvp.intro")}</p>
            {deadline}
            <div className="card">
              {state.parts.map((part) => (
                <div key={part.id} className="rsvp-part" role="group" aria-label={part.name}>
                  <div className="grow">
                    <b>{part.name}</b>
                    <span className="muted sm">
                      {" "}
                      {part.place
                        ? t("rsvp.partWhen", {
                            time: format.time(part.startsAt),
                            place: part.place,
                          })
                        : format.time(part.startsAt)}
                    </span>
                  </div>
                  <div className="chips">
                    {[true, false].map((yes) => (
                      <button
                        key={String(yes)}
                        type="button"
                        className="chip"
                        aria-pressed={attendance[part.id] === yes}
                        aria-label={`${part.name}: ${yes ? t("rsvp.attending") : t("rsvp.notAttending")}`}
                        onClick={() => {
                          setAttendance({ ...attendance, [part.id]: yes });
                        }}
                      >
                        {yes ? t("rsvp.attending") : t("rsvp.notAttending")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {alert}
        <div className="rsvp-actions">
          <span />
          <button
            type="button"
            className="btn"
            disabled={!answeredAll || state.parts.length === 0 || sending}
            onClick={() => {
              // Declining every part skips to the summary.
              if (attendingIds.length === 0) void submit();
              else setStep(2);
            }}
          >
            {attendingIds.length === 0 && answeredAll ? t("rsvp.send") : t("rsvp.next")}
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: food and allergies ----------------------------------------------------------
  if (step === 2) {
    return (
      <div className="stack">
        {header(2)}
        <h1 className="h1">{t("rsvp.food.title")}</h1>
        <div className="card">
          <div className="row">
            <b>{state.name}</b>
            <span className="tag">{t("rsvp.you")}</span>
          </div>
          {needsMenu && (
            <div
              className="field"
              role="group"
              aria-label={t("rsvp.menu", { part: mealPart.name })}
            >
              <span>{t("rsvp.menu", { part: mealPart.name })}</span>
              <div className="chips">
                {state.menus.map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    className="chip"
                    aria-pressed={menuId === menu.id}
                    onClick={() => {
                      setMenuId(menu.id);
                    }}
                  >
                    {menu.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field">
            <span>{t("rsvp.allergies")}</span>
            <textarea
              className="input"
              value={allergies}
              maxLength={500}
              placeholder={t("rsvp.allergiesPlaceholder")}
              onChange={(event) => {
                setAllergies(event.target.value);
              }}
            />
          </label>
          <span className="lock">🔒 {t("rsvp.allergiesLock")}</span>
        </div>
        {alert}
        <div className="rsvp-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setStep(1);
            }}
          >
            {t("rsvp.back")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={needsMenu && menuId === null}
            onClick={() => {
              setStep(3);
            }}
          >
            {t("rsvp.next")}
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: song wish -------------------------------------------------------------------
  return (
    <div className="stack">
      {header(3)}
      <h1 className="h1">{t("rsvp.songTitle")}</h1>
      <div className="card">
        <label className="field">
          <span>{t("rsvp.song")}</span>
          <input
            className="input"
            value={songWish}
            maxLength={200}
            onChange={(event) => {
              setSongWish(event.target.value);
            }}
          />
        </label>
        <span className="hint">{t("rsvp.songHint")}</span>
      </div>
      {alert}
      <div className="rsvp-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setStep(2);
          }}
        >
          {t("rsvp.back")}
        </button>
        <button type="button" className="btn" disabled={sending} onClick={() => void submit()}>
          {sending ? t("rsvp.sending") : t("rsvp.send")}
        </button>
      </div>
    </div>
  );
}
