// Accompanying persons in the RSVP (RSVP-08 – RSVP-10; UX mocks rsvp-people, rsvp-companion):
// the card of one attending person (menu and allergies), the request form, and the list with
// its status tags and actions.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_COMPANIONS, rsvpStateSchema } from "@zappaloo/shared";
import type {
  Companion,
  CompanionRequest,
  EventPart,
  MenuOption,
  RsvpState,
} from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useErrorText } from "../admin/data.ts";
import { answerOf, attendsAny, needsMenu, personOf } from "./person.ts";
import type { PersonValue } from "./person.ts";

/** Yes or no per part, one row each. */
export function PartsBlock({
  parts,
  value,
  onChange,
  time,
}: {
  parts: EventPart[];
  value: Record<number, boolean>;
  onChange: (next: Record<number, boolean>) => void;
  time: (part: EventPart) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="card">
      {parts.map((part) => (
        <div key={part.id} className="rsvp-part" role="group" aria-label={part.name}>
          <div className="grow">
            <b>{part.name}</b> <span className="muted sm">{time(part)}</span>
          </div>
          <div className="chips">
            {[true, false].map((yes) => (
              <button
                key={String(yes)}
                type="button"
                className="chip"
                aria-pressed={value[part.id] === yes}
                aria-label={`${part.name}: ${yes ? t("rsvp.attending") : t("rsvp.notAttending")}`}
                onClick={() => {
                  onChange({ ...value, [part.id]: yes });
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

/** Menu and allergies of one person (step 2). */
export function MenuFields({
  value,
  onChange,
  parts,
  menus,
  label,
}: {
  value: PersonValue;
  onChange: (next: PersonValue) => void;
  parts: EventPart[];
  menus: MenuOption[];
  /** Makes the field names unique when a companion is on the page; the guest needs none. */
  label?: string;
}) {
  const { t } = useTranslation();
  const meal = parts.find((part) => part.hasMeal);
  const prefixed = (text: string) => (label === undefined ? text : `${label}: ${text}`);
  return (
    <>
      {meal && needsMenu(value, parts, menus) && (
        <div
          className="field"
          role="group"
          aria-label={prefixed(t("rsvp.menu", { part: meal.name }))}
        >
          <span>{t("rsvp.menu", { part: meal.name })}</span>
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
  parts,
  menus,
  time,
  onSaved,
  onCancel,
}: {
  companion?: Companion;
  parts: EventPart[];
  menus: MenuOption[];
  time: (part: EventPart) => string;
  onSaved: (state: RsvpState) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const errorText = useErrorText();
  const [name, setName] = useState(companion?.name ?? "");
  const [note, setNote] = useState(companion?.note ?? "");
  const [value, setValue] = useState<PersonValue>(
    companion ? personOf(companion, parts) : { attendance: {}, menuId: null, allergies: "" },
  );
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const complete =
    name.trim() !== "" &&
    parts.every((part) => value.attendance[part.id] !== undefined) &&
    (!needsMenu(value, parts, menus) || value.menuId !== null);

  async function submit() {
    setSending(true);
    const body: CompanionRequest = {
      name: name.trim(),
      note: note.trim() === "" ? null : note.trim(),
      ...answerOf(value, parts, menus),
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

  return (
    <div className="stack">
      <h1 className="h1">{t("rsvp.companions.formTitle")}</h1>
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
      <b className="sm">{t("rsvp.companions.attendance")}</b>
      <PartsBlock
        parts={parts}
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
            parts={parts}
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
      <div className="rsvp-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t("rsvp.companions.cancel")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!complete || sending}
          onClick={() => void submit()}
        >
          {companion ? t("rsvp.companions.save") : t("rsvp.companions.request")}
        </button>
      </div>
    </div>
  );
}

/** The accompanying persons with their status and what the guest or admin can do (step 3). */
export function CompanionsCard({
  companions,
  parts,
  menus,
  admin,
  locked,
  onEdit,
  onNew,
  onChanged,
  onRefresh,
}: {
  companions: Companion[];
  parts: EventPart[];
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
  const [renaming, setRenaming] = useState<{ id: number; name: string }>();
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

  async function rename(id: number, name: string) {
    const result = await apiRequest("PATCH", `/api/admin/rsvp/companions/${String(id)}`, {
      body: { name },
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
      parts
        .filter((part) => companion.attendingPartIds.includes(part.id))
        .map((part) => part.name)
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
                    void rename(companion.id, renaming.name);
                  }}
                >
                  <input
                    className="input"
                    aria-label={t("rsvp.companions.name")}
                    value={renaming.name}
                    maxLength={100}
                    required
                    onChange={(event) => {
                      setRenaming({ id: companion.id, name: event.target.value });
                    }}
                  />
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
            <span className={STATUS_TAG[companion.status]}>
              {t(`rsvp.companions.status.${companion.status}`)}
            </span>
            {admin
              ? companion.status === "approved" &&
                renaming?.id !== companion.id && (
                  <button
                    type="button"
                    className="btn soft sm"
                    aria-label={`${t("rsvp.companions.rename")}: ${companion.name}`}
                    onClick={() => {
                      setRenaming({ id: companion.id, name: companion.name });
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
                    {companion.status === "rejected" && (
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
      {companions.some((c) => c.status === "approved") && !admin && (
        <span className="hint">{t("rsvp.companions.approvedHint")}</span>
      )}
      {!admin && !locked && open < MAX_COMPANIONS && (
        <button type="button" className="btn ghost sm" onClick={onNew}>
          + {t("rsvp.companions.new")}
        </button>
      )}
      {!admin && !locked && open >= MAX_COMPANIONS && (
        <span className="hint">{t("rsvp.companions.limit", { count: MAX_COMPANIONS })}</span>
      )}
      {!admin && <p className="hint">{t("rsvp.companions.ownInvitation")}</p>}
    </div>
  );
}
