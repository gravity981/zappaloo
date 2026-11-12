// The RSVP wizard (sw-architecture.md 7.4, 7.4.1; UX mocks rsvp-parts, rsvp-people,
// rsvp-companion, rsvp-done): attendance → food and allergies → accompanying persons and song
// wish, then a summary. Declining every program item (for the guest and the approved companions) skips
// to the summary. After the deadline the summary is read-only. The same wizard runs in admin
// mode for a guest (RSVP-04): the deadline does not apply there.
import "../app/ui.css";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { rsvpStateSchema, rsvpStatus } from "@zappaloo/shared";
import type { Companion, ProgramItem, RsvpAnswerRequest, RsvpState } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useAdminData, useErrorText } from "../admin/data.ts";
import { FlowShell } from "../guest/Shells.tsx";
import { CompanionForm, CompanionsCard, MenuFields, ProgramItemsBlock } from "./Companions.tsx";
import { answerOf, answeredAll, attendanceOf, attendsAny, needsMenu, personOf } from "./person.ts";
import type { PersonValue } from "./person.ts";
import { useEventFormat } from "./format.ts";

type Mode = { kind: "guest" } | { kind: "admin"; userId: number };
type Step = 1 | 2 | 3 | "summary";
/** The wizard, or the form of a companion request (a new one, or a pending one to change). */
type View = { kind: "wizard" } | { kind: "form"; companion?: Companion };

const TOTAL_STEPS = 3;
const WIZARD: View = { kind: "wizard" };

/**
 * The page frame: the guest's wizard sits in the flow frame of the mock (close button, title,
 * progress, sticky actions); the admin mode inside the admin area has no frame of its own.
 */
function Frame({
  flow,
  step,
  title,
  closeLabel,
  footer,
  children,
}: {
  flow: boolean;
  step: number | undefined;
  title: string;
  closeLabel: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  if (!flow) {
    return (
      <div className="stack">
        {children}
        {footer && <div className="rsvp-actions">{footer}</div>}
      </div>
    );
  }
  return (
    <FlowShell
      title={title}
      closeTo="/"
      closeLabel={closeLabel}
      footer={footer}
      {...(step ? { step, total: TOTAL_STEPS } : {})}
    >
      {children}
    </FlowShell>
  );
}

/** Loads the guest's RSVP; the form below starts from it and is rebuilt after each save. */
export default function RsvpWizard({ mode, onFinish }: { mode: Mode; onFinish?: () => void }) {
  const errorText = useErrorText();
  const path =
    mode.kind === "admin" ? `/api/admin/rsvp/guests/${String(mode.userId)}` : "/api/rsvp";
  const { data, failed, reload } = useAdminData(path, rsvpStateSchema);
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
      // The answer's time changes with every save of the guest's own answer; a change of the
      // companions alone keeps the form, so nothing the guest typed is lost.
      key={`${path}-${state.answer?.answeredAt ?? "new"}`}
      mode={mode}
      path={path}
      state={state}
      onSaved={(next) => {
        setSaved({ path, state: next });
      }}
      onRefresh={() => {
        setSaved(undefined);
        reload();
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
  onRefresh,
  onFinish,
}: {
  mode: Mode;
  path: string;
  state: RsvpState;
  onSaved: (state: RsvpState) => void;
  onRefresh: () => void;
  onFinish?: () => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const format = useEventFormat();
  const answer = state.answer;
  const initial: PersonValue = {
    attendance: answer ? attendanceOf(answer, state.programItems) : {},
    menuId: answer?.menuId ?? null,
    allergies: answer?.allergies ?? "",
  };
  // A program item added after the answer is open: the wizard starts at the attendance again.
  const [step, setStep] = useState<Step>(
    answer && (state.closed || answeredAll(initial, state.programItems)) ? "summary" : 1,
  );
  const [view, setView] = useState<View>(WIZARD);
  const [own, setOwn] = useState<PersonValue>(initial);
  const [songWish, setSongWish] = useState(answer?.songWish ?? "");
  /** What the guest changed about companions in the steps; the rest is as the server has it. */
  const [edits, setEdits] = useState<Record<number, PersonValue>>({});
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  const admin = mode.kind === "admin";
  const locked = state.closed && !admin;
  const { programItems, menus } = state;
  const time = (programItem: ProgramItem) =>
    programItem.place
      ? t("rsvp.programItemWhen", {
          time: format.time(programItem.startsAt),
          place: programItem.place,
        })
      : format.time(programItem.startsAt);

  const valueOf = (companion: Companion): PersonValue =>
    edits[companion.id] ?? personOf(companion, programItems);
  const approved = state.companions.filter((c) => c.status === "approved");
  /** Persons the RSVP is about: the guest and the companions that are not rejected. */
  const companions = state.companions.filter((c) => c.status !== "rejected");
  const attendingCompanions = companions.filter((c) => attendsAny(valueOf(c)));
  // The guest and the approved companions answer every program item in step 1.
  const ownAnswered =
    answeredAll(own, programItems) && approved.every((c) => answeredAll(valueOf(c), programItems));
  const nobody = !attendsAny(own) && attendingCompanions.length === 0;
  const menuMissing =
    (attendsAny(own) && needsMenu(own, programItems, menus) && own.menuId === null) ||
    attendingCompanions.some((c) => {
      const value = valueOf(c);
      return needsMenu(value, programItems, menus) && value.menuId === null;
    });

  async function submit() {
    setSending(true);
    const body: RsvpAnswerRequest = {
      ...answerOf(own, programItems, menus),
      ...(state.songEnabled && attendsAny(own)
        ? { songWish: songWish.trim() === "" ? null : songWish.trim() }
        : {}),
      // A pending request with an open program item keeps its answer; it is completed in its own form.
      companions: companions
        .filter((c) => answeredAll(valueOf(c), programItems))
        .map((c) => ({
          companionId: c.id,
          ...answerOf(valueOf(c), programItems, menus),
        })),
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

  /** Opens the companion form: a new request, or the change of a pending one. */
  function openForm(companion?: Companion) {
    setView(companion ? { kind: "form", companion } : { kind: "form" });
  }

  /** In admin mode the page says so (no frame, so no progress bar either). */
  const header = (current: number) =>
    admin ? (
      <>
        <span className="rsvp-step">{t("rsvp.step", { current, total: TOTAL_STEPS })}</span>
        <p className="hint">{t("rsvp.adminMode")}</p>
      </>
    ) : null;
  const alert = error && (
    <p role="alert" className="error">
      {error}
    </p>
  );
  const deadline = state.deadline && (
    <p className="muted sm">{t("rsvp.deadline", { date: format.day(state.deadline) })}</p>
  );

  // --- The request form of a companion -----------------------------------------------------
  if (view.kind === "form") {
    return (
      <CompanionForm
        key={view.companion?.id ?? "new"}
        programItems={programItems}
        menus={menus}
        time={time}
        frame={(body, footer) => (
          <Frame
            flow={!admin}
            step={undefined}
            title={t("rsvp.companions.formTitle")}
            closeLabel={t("rsvp.close")}
            footer={footer}
          >
            {body}
          </Frame>
        )}
        {...(view.companion ? { companion: view.companion } : {})}
        onCancel={() => {
          setView(WIZARD);
        }}
        onSaved={(next) => {
          // Companions change on their own; the guest's own answer stays as typed. What the
          // steps held for this companion is out of date now: the saved request wins.
          const savedId = view.companion?.id;
          if (savedId !== undefined) {
            setEdits((current) =>
              Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== savedId)),
            );
          }
          onSaved(next);
          setView(WIZARD);
        }}
      />
    );
  }

  // --- Summary ---------------------------------------------------------------------------
  if (step === "summary" || (locked && !answer)) {
    const status = rsvpStatus(
      answer !== null,
      programItems.map((programItem) => programItem.id),
      answer?.attendingItemIds ?? [],
      answer?.declinedItemIds ?? [],
    );
    const attending = status === "attending";
    const menuName = (id: number | null) => menus.find((menu) => menu.id === id)?.name;
    return (
      <Frame
        flow={!admin}
        step={undefined}
        title={t("rsvp.title")}
        closeLabel={t("rsvp.close")}
        footer={
          <>
            {!locked && programItems.length > 0 && (
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
          </>
        }
      >
        {admin && <p className="hint">{t("rsvp.adminMode")}</p>}
        <h1 className="h1">
          {status === "attending"
            ? t("rsvp.done", { name: state.name })
            : status === "declined"
              ? t("rsvp.declined", { name: state.name })
              : t("rsvp.notAnswered")}
        </h1>
        {answer && (
          <>
            <div className="card">
              <ul className="list">
                {programItems.map((programItem) => (
                  <li key={programItem.id} className="li">
                    <b className="grow">{programItem.name}</b>
                    {answer.attendingItemIds.includes(programItem.id) ? (
                      <span className="tag ok">{t("rsvp.attending")}</span>
                    ) : answer.declinedItemIds.includes(programItem.id) ? (
                      <span className="tag">{t("rsvp.notAttending")}</span>
                    ) : (
                      <span className="tag warn">{t("rsvp.openProgramItem")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {(attending ||
              state.companions.length > 0 ||
              (state.songEnabled && answer.songWish)) && (
              <div className="card">
                <ul className="list">
                  {attending && (
                    <li className="li">
                      <div className="grow">
                        <b>{state.name}</b>
                        <span className="muted sm">
                          {[
                            menuName(answer.menuId),
                            answer.allergies ? t("rsvp.allergiesGiven") : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </li>
                  )}
                  {state.companions.map((companion) => (
                    <li key={companion.id} className="li">
                      <div className="grow">
                        <b>{companion.name}</b>
                        <span className="muted sm">
                          {[
                            menuName(companion.menuId),
                            companion.allergies ? t("rsvp.allergiesGiven") : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <span
                        className={
                          companion.status === "approved"
                            ? "tag ok"
                            : companion.status === "pending"
                              ? "tag warn"
                              : "tag bad"
                        }
                      >
                        {t(`rsvp.companions.status.${companion.status}`)}
                      </span>
                    </li>
                  ))}
                  {state.songEnabled && answer.songWish && (
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
      </Frame>
    );
  }

  // --- Step 1: attendance ------------------------------------------------------------------
  if (step === 1) {
    return (
      <Frame
        flow={!admin}
        step={1}
        title={t("rsvp.title")}
        closeLabel={t("rsvp.close")}
        footer={
          <>
            <button
              type="button"
              className="btn"
              disabled={!ownAnswered || programItems.length === 0 || sending}
              onClick={() => {
                // Declining every program item skips to the summary.
                if (nobody) void submit();
                else setStep(2);
              }}
            >
              {nobody && ownAnswered ? t("rsvp.send") : t("rsvp.next")}
            </button>
          </>
        }
      >
        {header(1)}
        <h1 className="h1">{t("rsvp.greeting", { name: state.name })}</h1>
        {programItems.length === 0 ? (
          <p className="muted">{t("rsvp.noProgramItems")}</p>
        ) : (
          <>
            <p className="muted">{t("rsvp.intro")}</p>
            {deadline}
            <ProgramItemsBlock
              programItems={programItems}
              value={own.attendance}
              time={time}
              onChange={(attendance) => {
                setOwn({ ...own, attendance });
              }}
            />
            {approved.map((companion) => (
              <div key={companion.id} className="stack">
                <b className="sm">{companion.name}</b>
                <ProgramItemsBlock
                  programItems={programItems}
                  value={valueOf(companion).attendance}
                  time={time}
                  onChange={(attendance) => {
                    setEdits({ ...edits, [companion.id]: { ...valueOf(companion), attendance } });
                  }}
                />
              </div>
            ))}
          </>
        )}
        {alert}
      </Frame>
    );
  }

  // --- Step 2: food and allergies ----------------------------------------------------------
  if (step === 2) {
    return (
      <Frame
        flow={!admin}
        step={2}
        title={t("rsvp.title")}
        closeLabel={t("rsvp.close")}
        footer={
          <>
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
              disabled={menuMissing}
              onClick={() => {
                setStep(3);
              }}
            >
              {t("rsvp.next")}
            </button>
          </>
        }
      >
        {header(2)}
        <h1 className="h1">{t("rsvp.food.title")}</h1>
        {attendsAny(own) && (
          <div className="card">
            <div className="row">
              <b>{state.name}</b>
              <span className="tag">{t("rsvp.you")}</span>
            </div>
            <MenuFields value={own} onChange={setOwn} programItems={programItems} menus={menus} />
          </div>
        )}
        {attendingCompanions.map((companion) => (
          <div key={companion.id} className="card">
            <div className="row">
              <b>{companion.name}</b>
              <span className={companion.status === "approved" ? "tag ok" : "tag warn"}>
                {t(`rsvp.companions.status.${companion.status}`)}
              </span>
            </div>
            <MenuFields
              value={valueOf(companion)}
              onChange={(next) => {
                setEdits({ ...edits, [companion.id]: next });
              }}
              programItems={programItems}
              menus={menus}
              label={companion.name}
            />
          </div>
        ))}
        {alert}
      </Frame>
    );
  }

  // --- Step 3: companions and song wish ----------------------------------------------------
  return (
    <Frame
      flow={!admin}
      step={3}
      title={t("rsvp.title")}
      closeLabel={t("rsvp.close")}
      footer={
        <>
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
        </>
      }
    >
      {header(3)}
      <h1 className="h1">{t("rsvp.companions.stepTitle")}</h1>
      <CompanionsCard
        companions={state.companions}
        programItems={programItems}
        menus={menus}
        admin={admin}
        locked={locked}
        onEdit={openForm}
        onNew={() => {
          openForm();
        }}
        onChanged={onSaved}
        onRefresh={onRefresh}
      />
      {state.songEnabled && attendsAny(own) && (
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
      )}
      {alert}
    </Frame>
  );
}
