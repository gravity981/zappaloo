// Accompanying persons in the RSVP (RSVP-08 – RSVP-10; UX mocks rsvp-people, rsvp-companion):
// the card of one attending person (menu and allergies), the request form, and the list with
// its status tags and actions.
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MAX_COMPANIONS, PERSON_TYPES, rsvpStateSchema } from "@zappaloo/shared";
import type {
  Companion,
  CompanionRequest,
  PersonType,
  ProgramItem,
  MenuOption,
  RsvpState,
} from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useErrorText } from "../admin/data.ts";
import { answerOf, attendsAny, needsMenu, personOf } from "./person.ts";
import type { PersonValue } from "./person.ts";

/** Yes or no per program item, one row each. */
export function ProgramItemsBlock({
  programItems,
  value,
  onChange,
  time,
}: {
  programItems: ProgramItem[];
  value: Record<number, boolean>;
  onChange: (next: Record<number, boolean>) => void;
  time: (programItem: ProgramItem) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="card">
      {programItems.map((programItem) => (
        <div
          key={programItem.id}
          className="rsvp-program-item"
          role="group"
          aria-label={programItem.name}
        >
          <div className="grow">
            <b>{programItem.name}</b> <span className="muted sm">{time(programItem)}</span>
          </div>
          <div className="chips">
            {[true, false].map((yes) => (
              <button
                key={String(yes)}
                type="button"
                className="chip"
                aria-pressed={value[programItem.id] === yes}
                aria-label={`${programItem.name}: ${yes ? t("rsvp.attending") : t("rsvp.notAttending")}`}
                onClick={() => {
                  onChange({ ...value, [programItem.id]: yes });
                }}
              >
                {yes ? t("rsvp.attending") : t("rsvp.notAttending")}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The attendance of one person: yes or no per program item (RSVP-11 on), or one answer for all
 * the program items the person is invited to (off, the default). `name` words the buttons of an
 * accompanying person ("Mia kommt"); the guest's own say "Ich komme".
 */
export function AttendanceBlock({
  programItems,
  value,
  onChange,
  time,
  perItem,
  name,
}: {
  programItems: ProgramItem[];
  value: Record<number, boolean>;
  onChange: (next: Record<number, boolean>) => void;
  time: (programItem: ProgramItem) => string;
  perItem: boolean;
  name?: string;
}) {
  const { t } = useTranslation();
  if (perItem) {
    return (
      <ProgramItemsBlock
        programItems={programItems}
        value={value}
        onChange={onChange}
        time={time}
      />
    );
  }
  const current = programItems.length > 0 ? value[programItems[0]?.id ?? 0] : undefined;
  return (
    <div className="card">
      <div className="chips" role="group" aria-label={name ?? t("rsvp.attendanceOnce")}>
        {[true, false].map((yes) => {
          const text = t(yes ? "rsvp.yes" : "rsvp.no");
          return (
            <button
              key={String(yes)}
              type="button"
              className="chip"
              aria-pressed={current === yes}
              // Several persons answer on one page: the name tells the buttons apart.
              aria-label={name === undefined ? text : `${name}: ${text}`}
              onClick={() => {
                onChange(
                  Object.fromEntries(programItems.map((programItem) => [programItem.id, yes])),
                );
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
      <span className="hint">
        {programItems.map((programItem) => programItem.name).join(" · ")}
      </span>
    </div>
  );
}

/** Menu and allergies of one person (step 2). */
export function MenuFields({
  value,
  onChange,
  programItems,
  menus,
  label,
}: {
  value: PersonValue;
  onChange: (next: PersonValue) => void;
  programItems: ProgramItem[];
  menus: MenuOption[];
  /** Makes the field names unique when a companion is on the page; the guest needs none. */
  label?: string;
}) {
  const { t } = useTranslation();
  const meal = programItems.find((programItem) => programItem.hasMeal);
  const prefixed = (text: string) => (label === undefined ? text : `${label}: ${text}`);
  return (
    <>
      {meal && needsMenu(value, programItems, menus) && (
        <div
          className="field"
          role="group"
          aria-label={prefixed(t("rsvp.menu", { programItem: meal.name }))}
        >
          <span>{t("rsvp.menu", { programItem: meal.name })}</span>
          <div className="chips">
            {menus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                className="chip"
                aria-pressed={value.menuId === menu.id}
                aria-label={prefixed(menu.name)}
                onClick={() => {
                  onChange({ ...value, menuId: menu.id });
                }}
              >
                {menu.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        <span>
          {label === undefined ? t("rsvp.allergies") : `${t("rsvp.allergies")} (${label})`}
        </span>
        <textarea
          className="input"
          value={value.allergies}
          maxLength={500}
          placeholder={t("rsvp.allergiesPlaceholder")}
          onChange={(event) => {
            onChange({ ...value, allergies: event.target.value });
          }}
        />
      </label>
      <span className="lock">🔒 {t("rsvp.allergiesLock")}</span>
    </>
  );
}

const STATUS_TAG = { pending: "tag warn", approved: "tag ok", rejected: "tag bad" } as const;

/** The request form of a new person, or the change of a pending one (RSVP-08, RSVP-10). */
export function CompanionForm({
  companion,
  perItem,
  programItems,
  menus,
  time,
  frame,
  onSaved,
  onCancel,
}: {
  companion?: Companion;
  perItem: boolean;
  /** Puts the form's body and its action buttons into the page frame. */
  frame: (body: ReactNode, footer: ReactNode) => ReactNode;
  programItems: ProgramItem[];
  menus: MenuOption[];
  time: (programItem: ProgramItem) => string;
  onSaved: (state: RsvpState) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const [name, setName] = useState(companion?.name ?? "");
  const [note, setNote] = useState(companion?.note ?? "");
  /** The guest must choose the type, there is no default (RSVP-13). */
  const [type, setType] = useState<PersonType | undefined>(companion?.personType);
  const [answer, setAnswer] = useState<Omit<PersonValue, "personType">>(
    companion
      ? personOf(companion, programItems, perItem)
      : { attendance: {}, menuId: null, allergies: "" },
  );
  const value: PersonValue = { ...answer, personType: type ?? "adult" };
  const setValue = (next: PersonValue) => {
    setAnswer({ attendance: next.attendance, menuId: next.menuId, allergies: next.allergies });
  };
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const complete =
    type !== undefined &&
    name.trim() !== "" &&
    programItems.every((programItem) => value.attendance[programItem.id] !== undefined) &&
    (!needsMenu(value, programItems, menus) || value.menuId !== null);

  async function submit() {
    setSending(true);
    const body: CompanionRequest = {
      name: name.trim(),
      personType: type ?? "adult",
      note: note.trim() === "" ? null : note.trim(),
      ...answerOf(value, programItems, menus),
    };
    const result = companion
      ? await apiRequest("PUT", `/api/rsvp/companions/${String(companion.id)}`, {
          body,
          csrfToken: session.csrfToken,
        })
      : await apiRequest("POST", "/api/rsvp/companions", { body, csrfToken: session.csrfToken });
    setSending(false);
    const parsed = rsvpStateSchema.safeParse(result.body);
    if (result.ok && parsed.success) onSaved(parsed.data);
    else setError(errorText(result.errorCode ?? "unknown"));
  }

  return frame(
    <>
      <p className="muted">{t("rsvp.companions.formHint")}</p>
      <label className="field">
        <span>{t("rsvp.companions.name")}</span>
        <input
          className="input"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <label className="field">
        <span>{t("rsvp.companions.note")}</span>
        <input
          className="input"
          value={note}
          maxLength={500}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <div className="field" role="group" aria-label={t("rsvp.companions.type")}>
        <span>{t("rsvp.companions.type")}</span>
        <div className="chips">
          {PERSON_TYPES.map((personType) => (
            <button
              key={personType}
              type="button"
              className="chip"
              aria-pressed={type === personType}
              onClick={() => {
                setType(personType);
              }}
            >
              {t(`personTypes.${personType}`)}
            </button>
          ))}
        </div>
      </div>
      <b className="sm">{t("rsvp.companions.attendance")}</b>
      <AttendanceBlock
        perItem={perItem}
        {...(name.trim() === "" ? {} : { name: name.trim() })}
        programItems={programItems}
        value={value.attendance}
        time={time}
        onChange={(attendance) => {
          setValue({ ...value, attendance });
        }}
      />
      {attendsAny(value) && (
        <div className="card">
          <MenuFields
            value={value}
            onChange={setValue}
            programItems={programItems}
            menus={menus}
            label={name.trim() === "" ? t("rsvp.companions.thePerson") : name.trim()}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>,
    <>
      <button type="button" className="btn ghost" onClick={onCancel}>
        {t("rsvp.companions.cancel")}
      </button>
      <button
        type="button"
        className="btn"
        disabled={!complete || sending}
        onClick={() => void submit()}
      >
        {companion ? t("rsvp.companions.save") : t("rsvp.companions.add")}
      </button>
    </>,
  );
}

/** The accompanying persons with their status and what the guest or admin can do (step 3). */
export function CompanionsCard({
  companions,
  approval,
  programItems,
  menus,
  admin,
  locked,
  onEdit,
  onNew,
  onChanged,
  onRefresh,
}: {
  companions: Companion[];
  /** Whether an added person waits for the admin's approval (RSVP-12). */
  approval: boolean;
  programItems: ProgramItem[];
  menus: MenuOption[];
  admin: boolean;
  locked: boolean;
  onEdit: (companion: Companion) => void;
  onNew: () => void;
  onChanged: (state: RsvpState) => void;
  /** Loads the state again (after the admin renamed someone). */
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState<{ id: number; name: string; personType: PersonType }>();
  const open = companions.filter((c) => c.status !== "rejected").length;

  async function remove(companion: Companion) {
    const result = await apiRequest("DELETE", `/api/rsvp/companions/${String(companion.id)}`, {
      csrfToken: session.csrfToken,
    });
    const parsed = rsvpStateSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setError(undefined);
      onChanged(parsed.data);
    } else setError(errorText(result.errorCode ?? "unknown"));
  }

  async function rename(id: number, name: string, personType: PersonType) {
    const result = await apiRequest("PATCH", `/api/admin/rsvp/companions/${String(id)}`, {
      body: { name, personType },
      csrfToken: session.csrfToken,
    });
    if (result.ok) {
      setError(undefined);
      setRenaming(undefined);
      onRefresh();
    } else setError(errorText(result.errorCode ?? "unknown"));
  }

  const summary = (companion: Companion) =>
    [
      programItems
        .filter((programItem) => companion.attendingItemIds.includes(programItem.id))
        .map((programItem) => programItem.name)
        .join(", "),
      menus.find((menu) => menu.id === companion.menuId)?.name,
    ]
      .filter((text) => text !== undefined && text !== "")
      .join(" · ") || t("rsvp.notAttending");

  return (
    <div className="card">
      <b>{t("rsvp.companions.title")}</b>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="list">
        {companions.map((companion) => (
          <li key={companion.id} className="li">
            <div className="grow">
              {renaming?.id === companion.id ? (
                <form
                  className="row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename(companion.id, renaming.name, renaming.personType);
                  }}
                >
                  <input
                    className="input"
                    aria-label={t("rsvp.companions.name")}
                    value={renaming.name}
                    maxLength={100}
                    required
                    onChange={(event) => {
                      setRenaming({ ...renaming, id: companion.id, name: event.target.value });
                    }}
                  />
                  <select
                    className="input auto"
                    aria-label={t("rsvp.companions.type")}
                    value={renaming.personType}
                    onChange={(event) => {
                      setRenaming({
                        ...renaming,
                        personType: event.target.value as PersonType,
                      });
                    }}
                  >
                    {PERSON_TYPES.map((personType) => (
                      <option key={personType} value={personType}>
                        {t(`personTypes.${personType}`)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn sm">
                    {t("rsvp.companions.save")}
                  </button>
                </form>
              ) : (
                <b>{companion.name}</b>
              )}
              <span className="muted sm">{summary(companion)}</span>
              {companion.note && <span className="hint">«{companion.note}»</span>}
            </div>
            {/* Without approval every added person counts at once: no status to show. */}
            {(approval || companion.status !== "approved") && (
              <span className={STATUS_TAG[companion.status]}>
                {t(`rsvp.companions.status.${companion.status}`)}
              </span>
            )}
            {admin
              ? companion.status === "approved" &&
                renaming?.id !== companion.id && (
                  <button
                    type="button"
                    className="btn soft sm"
                    aria-label={`${t("rsvp.companions.rename")}: ${companion.name}`}
                    onClick={() => {
                      setRenaming({
                        id: companion.id,
                        name: companion.name,
                        personType: companion.personType,
                      });
                    }}
                  >
                    {t("rsvp.companions.rename")}
                  </button>
                )
              : !locked && (
                  <>
                    {companion.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="btn soft sm"
                          aria-label={`${t("rsvp.companions.edit")}: ${companion.name}`}
                          onClick={() => {
                            onEdit(companion);
                          }}
                        >
                          {t("rsvp.companions.edit")}
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          aria-label={`${t("rsvp.companions.withdraw")}: ${companion.name}`}
                          onClick={() => void remove(companion)}
                        >
                          {t("rsvp.companions.withdraw")}
                        </button>
                      </>
                    )}
                    {(companion.status === "rejected" ||
                      (companion.status === "approved" && !approval)) && (
                      <button
                        type="button"
                        className="btn ghost sm"
                        aria-label={`${t("rsvp.companions.remove")}: ${companion.name}`}
                        onClick={() => void remove(companion)}
                      >
                        {t("rsvp.companions.remove")}
                      </button>
                    )}
                  </>
                )}
          </li>
        ))}
      </ul>
      {!admin && !locked && open < MAX_COMPANIONS && (
        <button type="button" className="btn ghost sm" onClick={onNew}>
          + {t("rsvp.companions.new")}
        </button>
      )}
      {!admin && !locked && open >= MAX_COMPANIONS && (
        <span className="hint">{t("rsvp.companions.limit", { count: MAX_COMPANIONS })}</span>
      )}
    </div>
  );
}
