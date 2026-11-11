// Einstellungen › Rückmeldung (RSVP-02, RSVP-03, RSVP-04; sw-architecture.md 7.4.1): the
// deadline, the event parts (name, start, place, which one has the meal) and the one list of
// menu options.
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { instantToLocal, localToInstant, rsvpConfigSchema } from "@zappaloo/shared";
import type { EventPart } from "@zappaloo/shared";
import { fieldText } from "../app/forms.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const PARTS_PATH = "/api/admin/rsvp/parts";

/** The form of one part; `part` undefined is a new one. */
function PartForm({
  part,
  timeZone,
  onSubmit,
  onCancel,
}: {
  part?: EventPart;
  timeZone: string;
  onSubmit: (body: object) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const place = fieldText(form, "place").trim();
    void onSubmit({
      name: fieldText(form, "name"),
      startsAt: localToInstant(fieldText(form, "startsAt"), timeZone).toISOString(),
      place: place === "" ? null : place,
      hasMeal: form.get("hasMeal") !== null,
    });
  }
  return (
    <form className="card flat" onSubmit={submit}>
      <div className="inline-form">
        <label className="field">
          <span>{t("admin.rsvpSettings.partName")}</span>
          <input className="input" name="name" required maxLength={60} defaultValue={part?.name} />
        </label>
        <label className="field">
          <span>{t("admin.rsvpSettings.partStart")}</span>
          <input
            className="input"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={part ? instantToLocal(part.startsAt, timeZone) : undefined}
          />
        </label>
        <label className="field">
          <span>{t("admin.rsvpSettings.partPlace")}</span>
          <input className="input" name="place" maxLength={100} defaultValue={part?.place ?? ""} />
        </label>
      </div>
      <label className="row sm">
        <input type="checkbox" name="hasMeal" defaultChecked={part?.hasMeal ?? false} />
        {t("admin.rsvpSettings.partMeal")}
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
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  /** The part being edited, "new" for the add form, or undefined. */
  const [editing, setEditing] = useState<number | "new">();
  const [confirmDelete, setConfirmDelete] = useState<number>();
  const [menuName, setMenuName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string }>();

  /** Runs a change; reloads on success and shows the error text otherwise. */
  async function run(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: object) {
    const result = await call(method, path, body);
    setSaved(false);
    if (result.ok) {
      setError(undefined);
      reload();
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

      <b className="sm">{t("admin.rsvpSettings.parts")}</b>
      <span className="hint">{t("admin.rsvpSettings.partsHint")}</span>
      {data.parts.length === 0 && <span className="hint">{t("admin.rsvpSettings.noParts")}</span>}
      <ul className="list">
        {data.parts.map((part) =>
          editing === part.id ? (
            <li key={part.id}>
              <PartForm
                part={part}
                timeZone={format.timeZone}
                onCancel={() => {
                  setEditing(undefined);
                }}
                onSubmit={async (body) => {
                  if (await run("PATCH", `/api/admin/rsvp/parts/${String(part.id)}`, body)) {
                    setEditing(undefined);
                  }
                }}
              />
            </li>
          ) : (
            <li key={part.id} className="li">
              <div className="grow">
                <b>{part.name}</b>
                {part.hasMeal && <span className="tag ok">{t("admin.rsvpSettings.mealTag")}</span>}
                <span className="hint">
                  {format.date(part.startsAt)} {format.time(part.startsAt)}
                  {part.place && ` · ${part.place}`}
                </span>
              </div>
              <button
                type="button"
                className="btn soft sm"
                aria-label={`${t("admin.rsvpSettings.edit")}: ${part.name}`}
                onClick={() => {
                  setEditing(part.id);
                }}
              >
                {t("admin.rsvpSettings.edit")}
              </button>
              {confirmDelete === part.id ? (
                <button
                  type="button"
                  className="btn danger sm"
                  aria-label={`${t("admin.rsvpSettings.confirmDelete")} ${part.name}`}
                  onClick={() => {
                    setConfirmDelete(undefined);
                    void run("DELETE", `/api/admin/rsvp/parts/${String(part.id)}`);
                  }}
                >
                  {t("admin.rsvpSettings.confirmDelete")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`${t("admin.rsvpSettings.delete")}: ${part.name}`}
                  onClick={() => {
                    setConfirmDelete(part.id);
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
        <PartForm
          timeZone={format.timeZone}
          onCancel={() => {
            setEditing(undefined);
          }}
          onSubmit={async (body) => {
            if (await run("POST", PARTS_PATH, body)) setEditing(undefined);
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
          {t("admin.rsvpSettings.addPart")}
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
