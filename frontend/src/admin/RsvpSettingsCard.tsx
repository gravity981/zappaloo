// Einstellungen › Rückmeldung (RSVP-02, RSVP-03, RSVP-04; sw-architecture.md 7.4.1): the
// deadline, the program items (name, start, place from Inhalte, which one has the meal) and the one
// list of menu options.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  contentResponseSchema,
  instantToLocal,
  localToInstant,
  rsvpConfigSchema,
} from "@zappaloo/shared";
import type { ContentPlace, ProgramItem } from "@zappaloo/shared";
import { fieldText } from "../app/forms.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { notifyRsvpChanged } from "./pending.ts";
import { Switch } from "./ui.tsx";

const PROGRAM_ITEMS_PATH = "/api/admin/rsvp/program-items";
const CONTENT_PATH = "/api/content";
const SONG_PATH = "/api/admin/rsvp/song";
const PER_ITEM_PATH = "/api/admin/rsvp/per-item";
const APPROVAL_PATH = "/api/admin/rsvp/companion-approval";

/** The form of one program item; `programItem` undefined is a new one. */
function ProgramItemForm({
  programItem,
  places,
  timeZone,
  onSubmit,
  onCancel,
}: {
  programItem?: ProgramItem;
  /** The places of Inhalte (CNT-07) the item can refer to. */
  places: ContentPlace[];
  timeZone: string;
  onSubmit: (body: object) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const placeId = fieldText(form, "placeId");
    const endsAtValue = fieldText(form, "endsAt");
    void onSubmit({
      name: fieldText(form, "name"),
      startsAt: localToInstant(fieldText(form, "startsAt"), timeZone).toISOString(),
      endsAt: endsAtValue === "" ? null : localToInstant(endsAtValue, timeZone).toISOString(),
      placeId: placeId === "" ? null : Number(placeId),
      hasMeal: form.get("hasMeal") !== null,
    });
  }
  return (
    <form className="card flat" onSubmit={submit}>
      <div className="inline-form">
        <label className="field">
          <span>{t("admin.rsvpSettings.programItemName")}</span>
          <input
            className="input"
            name="name"
            required
            maxLength={60}
            defaultValue={programItem?.name}
          />
        </label>
        <label className="field">
          <span>{t("admin.rsvpSettings.programItemStart")}</span>
          <input
            className="input"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={programItem ? instantToLocal(programItem.startsAt, timeZone) : undefined}
          />
        </label>
        <label className="field">
          <span>{t("admin.rsvpSettings.programItemEnd")}</span>
          <input
            className="input"
            name="endsAt"
            type="datetime-local"
            defaultValue={
              programItem?.endsAt ? instantToLocal(programItem.endsAt, timeZone) : undefined
            }
          />
        </label>
        <label className="field">
          <span>{t("admin.rsvpSettings.programItemPlace")}</span>
          <select className="input" name="placeId" defaultValue={programItem?.placeId ?? ""}>
            <option value="">{t("admin.rsvpSettings.noPlace")}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          {places.length === 0 && (
            <small className="hint">
              <Link to="/admin/content">{t("admin.rsvpSettings.placesFirst")}</Link>
            </small>
          )}
        </label>
      </div>
      <label className="row sm">
        <input type="checkbox" name="hasMeal" defaultChecked={programItem?.hasMeal ?? false} />
        {t("admin.rsvpSettings.programItemMeal")}
      </label>
      <div className="row">
        <button type="submit" className="btn sm">
          {t("admin.rsvpSettings.save")}
        </button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          {t("admin.rsvpSettings.cancel")}
        </button>
      </div>
    </form>
  );
}

export default function RsvpSettingsCard() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const format = useEventFormat();
  const { data, reload } = useAdminData("/api/admin/rsvp/config", rsvpConfigSchema);
  const { data: content } = useAdminData(CONTENT_PATH, contentResponseSchema);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  /** The program item being edited, "new" for the add form, or undefined. */
  const [editing, setEditing] = useState<number | "new">();
  const [confirmDelete, setConfirmDelete] = useState<number>();
  const [menuName, setMenuName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string }>();
  /** Switching the approval off asks first while requests wait: they are approved with it. */
  const [confirmApprovalOff, setConfirmApprovalOff] = useState(false);

  /** Runs a change; reloads on success and shows the error text otherwise. */
  async function run(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: object) {
    const result = await call(method, path, body);
    setSaved(false);
    if (result.ok) {
      setError(undefined);
      reload();
      // Switching the approval changes the badge of the navigation (RSVP-12).
      if (path === APPROVAL_PATH) notifyRsvpChanged();
    } else {
      setError(errorText(result.errorCode));
    }
    return result.ok;
  }

  async function saveDeadline(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = fieldText(new FormData(event.currentTarget), "deadline");
    if (await run("PUT", "/api/admin/rsvp/deadline", { deadline: date === "" ? null : date })) {
      setSaved(true);
    }
  }

  if (!data) return null;
  return (
    <section className="card" aria-labelledby="rsvp-settings-title">
      <b id="rsvp-settings-title">{t("admin.rsvpSettings.title")}</b>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <form className="stack" onSubmit={(event) => void saveDeadline(event)}>
        <label className="field">
          <span>{t("admin.rsvpSettings.deadline")}</span>
          <input
            className="input auto"
            name="deadline"
            type="date"
            key={data.deadline ?? "none"}
            defaultValue={data.deadline ?? ""}
          />
          <span className="hint">{t("admin.rsvpSettings.deadlineHint")}</span>
        </label>
        <div className="row">
          <button type="submit" className="btn soft sm">
            {t("admin.rsvpSettings.saveDeadline")}
          </button>
          {data.deadline && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void run("PUT", "/api/admin/rsvp/deadline", { deadline: null })}
            >
              {t("admin.rsvpSettings.clearDeadline")}
            </button>
          )}
          {saved && (
            <span role="status" className="hint">
              {t("admin.rsvpSettings.saved")}
            </span>
          )}
        </div>
      </form>

      <div className="setrow">
        <div className="grow">
          <b className="sm">{t("admin.rsvpSettings.song")}</b>
          <span className="hint">{t("admin.rsvpSettings.songHint")}</span>
        </div>
        <Switch
          checked={data.songEnabled}
          label={t("admin.rsvpSettings.song")}
          onChange={(enabled) => void run("PUT", SONG_PATH, { enabled })}
        />
      </div>

      <div className="setrow">
        <div className="grow">
          <b className="sm">{t("admin.rsvpSettings.perItem")}</b>
          <span className="hint">{t("admin.rsvpSettings.perItemHint")}</span>
        </div>
        <Switch
          checked={data.perItem}
          label={t("admin.rsvpSettings.perItem")}
          onChange={(enabled) => void run("PUT", PER_ITEM_PATH, { enabled })}
        />
      </div>

      <div className="setrow">
        <div className="grow">
          <b className="sm">{t("admin.rsvpSettings.companionApproval")}</b>
          <span className="hint">{t("admin.rsvpSettings.companionApprovalHint")}</span>
        </div>
        <Switch
          checked={data.companionApproval}
          label={t("admin.rsvpSettings.companionApproval")}
          onChange={(enabled) => {
            if (!enabled && data.pendingCount > 0) setConfirmApprovalOff(true);
            else void run("PUT", APPROVAL_PATH, { enabled });
          }}
        />
      </div>
      {confirmApprovalOff && (
        <div className="card flat" role="alertdialog" aria-labelledby="approval-off">
          <span id="approval-off">
            {t("admin.rsvpSettings.approvalOffConfirm", { count: data.pendingCount })}
          </span>
          <div className="row">
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                void run("PUT", APPROVAL_PATH, { enabled: false }).then(() => {
                  setConfirmApprovalOff(false);
                })
              }
            >
              {t("admin.rsvpSettings.approvalOffFinal")}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setConfirmApprovalOff(false);
              }}
            >
              {t("admin.rsvpSettings.cancel")}
            </button>
          </div>
        </div>
      )}

      <b className="sm">{t("admin.rsvpSettings.programItems")}</b>
      <span className="hint">{t("admin.rsvpSettings.programItemsHint")}</span>
      {data.programItems.length === 0 && (
        <span className="hint">{t("admin.rsvpSettings.noProgramItems")}</span>
      )}
      <ul className="list">
        {data.programItems.map((programItem) =>
          editing === programItem.id ? (
            <li key={programItem.id}>
              <ProgramItemForm
                programItem={programItem}
                places={content?.places ?? []}
                timeZone={format.timeZone}
                onCancel={() => {
                  setEditing(undefined);
                }}
                onSubmit={async (body) => {
                  if (
                    await run(
                      "PATCH",
                      `/api/admin/rsvp/program-items/${String(programItem.id)}`,
                      body,
                    )
                  ) {
                    setEditing(undefined);
                  }
                }}
              />
            </li>
          ) : (
            <li key={programItem.id} className="li">
              <div className="grow">
                <b>{programItem.name}</b>
                {programItem.hasMeal && (
                  <span className="tag ok">{t("admin.rsvpSettings.mealTag")}</span>
                )}
                <span className="hint">
                  {format.date(programItem.startsAt)} {format.time(programItem.startsAt)}
                  {programItem.endsAt !== null && `–${format.time(programItem.endsAt)}`}
                  {programItem.place && ` · ${programItem.place}`}
                </span>
              </div>
              <button
                type="button"
                className="btn soft sm"
                aria-label={`${t("admin.rsvpSettings.edit")}: ${programItem.name}`}
                onClick={() => {
                  setEditing(programItem.id);
                }}
              >
                {t("admin.rsvpSettings.edit")}
              </button>
              {confirmDelete === programItem.id ? (
                <button
                  type="button"
                  className="btn danger sm"
                  aria-label={`${t("admin.rsvpSettings.confirmDelete")} ${programItem.name}`}
                  onClick={() => {
                    setConfirmDelete(undefined);
                    void run("DELETE", `/api/admin/rsvp/program-items/${String(programItem.id)}`);
                  }}
                >
                  {t("admin.rsvpSettings.confirmDelete")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`${t("admin.rsvpSettings.delete")}: ${programItem.name}`}
                  onClick={() => {
                    setConfirmDelete(programItem.id);
                  }}
                >
                  {t("admin.rsvpSettings.delete")}
                </button>
              )}
            </li>
          ),
        )}
      </ul>
      {confirmDelete !== undefined && (
        <span className="hint">{t("admin.rsvpSettings.deleteHint")}</span>
      )}
      {editing === "new" ? (
        <ProgramItemForm
          places={content?.places ?? []}
          timeZone={format.timeZone}
          onCancel={() => {
            setEditing(undefined);
          }}
          onSubmit={async (body) => {
            if (await run("POST", PROGRAM_ITEMS_PATH, body)) setEditing(undefined);
          }}
        />
      ) : (
        <button
          type="button"
          className="btn soft sm"
          onClick={() => {
            setEditing("new");
          }}
        >
          {t("admin.rsvpSettings.addProgramItem")}
        </button>
      )}

      <b className="sm">{t("admin.rsvpSettings.menus")}</b>
      <span className="hint">{t("admin.rsvpSettings.menusHint")}</span>
      {data.menus.length === 0 && <span className="hint">{t("admin.rsvpSettings.noMenus")}</span>}
      <ul className="list">
        {data.menus.map((menu) => (
          <li key={menu.id} className="li">
            {renaming?.id === menu.id ? (
              <form
                className="row grow"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("PATCH", `/api/admin/rsvp/menus/${String(menu.id)}`, {
                    name: renaming.name,
                  }).then((ok) => {
                    if (ok) setRenaming(undefined);
                  });
                }}
              >
                <input
                  className="input"
                  aria-label={t("admin.rsvpSettings.menuName")}
                  value={renaming.name}
                  maxLength={60}
                  required
                  onChange={(event) => {
                    setRenaming({ id: menu.id, name: event.target.value });
                  }}
                />
                <button type="submit" className="btn sm">
                  {t("admin.rsvpSettings.save")}
                </button>
              </form>
            ) : (
              <>
                <span className="grow">{menu.name}</span>
                <button
                  type="button"
                  className="btn soft sm"
                  aria-label={`${t("admin.rsvpSettings.edit")}: ${menu.name}`}
                  onClick={() => {
                    setRenaming({ id: menu.id, name: menu.name });
                  }}
                >
                  {t("admin.rsvpSettings.edit")}
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`${t("admin.rsvpSettings.delete")}: ${menu.name}`}
                  onClick={() => void run("DELETE", `/api/admin/rsvp/menus/${String(menu.id)}`)}
                >
                  {t("admin.rsvpSettings.delete")}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void run("POST", "/api/admin/rsvp/menus", { name: menuName }).then((ok) => {
            if (ok) setMenuName("");
          });
        }}
      >
        <input
          className="input auto"
          aria-label={t("admin.rsvpSettings.menuName")}
          value={menuName}
          maxLength={60}
          onChange={(event) => {
            setMenuName(event.target.value);
          }}
        />
        <button type="submit" className="btn soft sm" disabled={menuName.trim() === ""}>
          {t("admin.rsvpSettings.addMenu")}
        </button>
      </form>
    </section>
  );
}
