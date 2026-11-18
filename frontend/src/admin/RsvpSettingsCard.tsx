// Einstellungen › Anmeldung (RSVP-02, RSVP-03, RSVP-04, RSVP-17; sw-architecture.md 7.4.1,
// 7.4.3): the deadline, the program items (name, which one has the meal) with their activities
// (name, start, end, place from Inhalte) under each, and the one list of menu options.
import { Fragment, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  contentResponseSchema,
  instantToLocal,
  localToInstant,
  rsvpConfigSchema,
} from "@zappaloo/shared";
import type { Activity, ContentPlace, ProgramItem } from "@zappaloo/shared";
import { fieldText } from "../app/forms.ts";
import { useEventFormat } from "../rsvp/format.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { DateTimeField } from "./DateTimeField.tsx";
import { notifyRsvpChanged } from "./pending.ts";
import { Switch } from "./ui.tsx";

const PROGRAM_ITEMS_PATH = "/api/admin/rsvp/program-items";
/** The form fields of an activity's start and end (`DateTimeField`). */
const STARTS_AT = "startsAt";
const ENDS_AT = "endsAt";
const ACTIVITIES_PATH = "/api/admin/rsvp/activities";
const CONTENT_PATH = "/api/content";
const SONG_PATH = "/api/admin/rsvp/song";
const PER_ITEM_PATH = "/api/admin/rsvp/per-item";
const APPROVAL_PATH = "/api/admin/rsvp/companion-approval";

/** An activity as the form sends it (the request of RSVP-17). */
interface ActivityBody {
  name: string;
  startsAt: string;
  endsAt: string | null;
  placeId: number | null;
}

/** Reads the fields of `ActivityInputs` from a submitted form. */
function readActivity(form: FormData, timeZone: string): ActivityBody {
  const placeId = fieldText(form, "placeId");
  const endsAt = fieldText(form, ENDS_AT);
  return {
    name: fieldText(form, "activityName"),
    startsAt: localToInstant(fieldText(form, STARTS_AT), timeZone).toISOString(),
    endsAt: endsAt === "" ? null : localToInstant(endsAt, timeZone).toISOString(),
    placeId: placeId === "" ? null : Number(placeId),
  };
}

/** The fields of an activity: name, start, optional end and a place from Inhalte (CNT-07). */
function ActivityInputs({
  activity,
  places,
  timeZone,
}: {
  activity?: Activity;
  /** The places of Inhalte the activity can refer to. */
  places: ContentPlace[];
  timeZone: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-form">
      <label className="field">
        <span>{t("admin.rsvpSettings.activityName")}</span>
        <input
          className="input"
          name="activityName"
          required
          maxLength={60}
          defaultValue={activity?.name}
        />
      </label>
      <DateTimeField
        name={STARTS_AT}
        label={t("admin.rsvpSettings.programItemStart")}
        required
        defaultValue={activity ? instantToLocal(activity.startsAt, timeZone) : undefined}
      />
      <DateTimeField
        name={ENDS_AT}
        label={t("admin.rsvpSettings.programItemEnd")}
        defaultValue={activity?.endsAt ? instantToLocal(activity.endsAt, timeZone) : undefined}
      />
      <label className="field">
        <span>{t("admin.rsvpSettings.programItemPlace")}</span>
        <select className="input" name="placeId" defaultValue={activity?.placeId ?? ""}>
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
  );
}

/** The form of one activity; `activity` undefined is a new one (RSVP-17). */
function ActivityForm({
  activity,
  places,
  timeZone,
  onSubmit,
  onCancel,
}: {
  activity?: Activity;
  places: ContentPlace[];
  timeZone: string;
  onSubmit: (body: ActivityBody) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(readActivity(new FormData(event.currentTarget), timeZone));
  }
  return (
    <form className="stack" onSubmit={submit}>
      <ActivityInputs activity={activity} places={places} timeZone={timeZone} />
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

/**
 * The form of one program item: its name and the meal. A new program item asks for its first
 * activity too (RSVP-17); the activities of an existing one are edited under it.
 */
function ProgramItemForm({
  programItem,
  places,
  timeZone,
  onSubmit,
  onCancel,
}: {
  programItem?: ProgramItem;
  places: ContentPlace[];
  timeZone: string;
  onSubmit: (
    item: { name: string; hasMeal: boolean },
    firstActivity: ActivityBody | undefined,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSubmit(
      { name: fieldText(form, "name"), hasMeal: form.get("hasMeal") !== null },
      programItem ? undefined : readActivity(form, timeZone),
    );
  }
  return (
    <form className="card flat" onSubmit={submit}>
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
      <label className="row sm">
        <input type="checkbox" name="hasMeal" defaultChecked={programItem?.hasMeal ?? false} />
        {t("admin.rsvpSettings.programItemMeal")}
      </label>
      {!programItem && (
        <>
          <span className="hint">{t("admin.rsvpSettings.firstActivity")}</span>
          <ActivityInputs places={places} timeZone={timeZone} />
        </>
      )}
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

/** Earlier first; the same start keeps the order of creation (RSVP-17). */
const byStart = (a: Activity, b: Activity) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id;

/** The program items by the start of their first activity, each with its activities by start. */
function chronological(programItems: ProgramItem[]): ProgramItem[] {
  const sorted = programItems.map((item) => ({
    ...item,
    activities: [...item.activities].sort(byStart),
  }));
  const first = (item: ProgramItem) =>
    item.activities[0] ? Date.parse(item.activities[0].startsAt) : Infinity;
  return sorted.sort((a, b) => first(a) - first(b) || a.id - b.id);
}

export default function RsvpSettingsCard() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const format = useEventFormat();
  const { data, reload } = useAdminData("/api/admin/rsvp/config", rsvpConfigSchema);
  const { data: content } = useAdminData(CONTENT_PATH, contentResponseSchema);
  const places = content?.places ?? [];
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  /** The program item being edited, "new" for the add form, or undefined. */
  const [editing, setEditing] = useState<number | "new">();
  /** The activity being edited, or the program item that gets a new one. */
  const [activityEdit, setActivityEdit] = useState<
    { kind: "edit"; id: number } | { kind: "add"; programItemId: number }
  >();
  const [confirmDelete, setConfirmDelete] = useState<number>();
  const [menuName, setMenuName] = useState("");
  const [childMenuName, setChildMenuName] = useState("");
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
  /** One menu list: the adults' or the children's (RSVP-19). */
  const menuSection = (forChildren: boolean) => {
    const menus = data.menus.filter((menu) => menu.forChildren === forChildren);
    const newName = forChildren ? childMenuName : menuName;
    const setNewName = forChildren ? setChildMenuName : setMenuName;
    return (
      <Fragment key={forChildren ? "children" : "adults"}>
        <b className="sm">
          {t(forChildren ? "admin.rsvpSettings.childMenus" : "admin.rsvpSettings.menus")}
        </b>
        <span className="hint">
          {t(forChildren ? "admin.rsvpSettings.childMenusHint" : "admin.rsvpSettings.menusHint")}
        </span>
        {menus.length === 0 && (
          <span className="hint">
            {t(forChildren ? "admin.rsvpSettings.noChildMenus" : "admin.rsvpSettings.noMenus")}
          </span>
        )}
        <ul className="list">
          {menus.map((menu) => (
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
            void run("POST", "/api/admin/rsvp/menus", { name: newName, forChildren }).then((ok) => {
              if (ok) setNewName("");
            });
          }}
        >
          <input
            className="input auto"
            aria-label={t(
              forChildren ? "admin.rsvpSettings.childMenuName" : "admin.rsvpSettings.menuName",
            )}
            value={newName}
            maxLength={60}
            onChange={(event) => {
              setNewName(event.target.value);
            }}
          />
          <button type="submit" className="btn soft sm" disabled={newName.trim() === ""}>
            {t(forChildren ? "admin.rsvpSettings.addChildMenu" : "admin.rsvpSettings.addMenu")}
          </button>
        </form>
      </Fragment>
    );
  };

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
      <ul className="stack">
        {chronological(data.programItems).map((programItem) => (
          <li key={programItem.id} className="card flat">
            {editing === programItem.id ? (
              <ProgramItemForm
                programItem={programItem}
                places={places}
                timeZone={format.timeZone}
                onCancel={() => {
                  setEditing(undefined);
                }}
                onSubmit={async (item) => {
                  if (
                    await run(
                      "PATCH",
                      `/api/admin/rsvp/program-items/${String(programItem.id)}`,
                      item,
                    )
                  ) {
                    setEditing(undefined);
                  }
                }}
              />
            ) : (
              <div className="row">
                <b className="grow">
                  {programItem.name}
                  {programItem.hasMeal && (
                    <span className="tag ok">{t("admin.rsvpSettings.mealTag")}</span>
                  )}
                </b>
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
              </div>
            )}
            <ul className="list">
              {programItem.activities.map((activity) =>
                activityEdit?.kind === "edit" && activityEdit.id === activity.id ? (
                  <li key={activity.id}>
                    <ActivityForm
                      activity={activity}
                      places={places}
                      timeZone={format.timeZone}
                      onCancel={() => {
                        setActivityEdit(undefined);
                      }}
                      onSubmit={async (body) => {
                        if (await run("PATCH", `${ACTIVITIES_PATH}/${String(activity.id)}`, body)) {
                          setActivityEdit(undefined);
                        }
                      }}
                    />
                  </li>
                ) : (
                  <li key={activity.id} className="li">
                    <div className="grow">
                      <b className="sm">{activity.name}</b>
                      <span className="hint">
                        {format.date(activity.startsAt)} {format.time(activity.startsAt)}
                        {activity.endsAt !== null && `–${format.time(activity.endsAt)}`}
                        {activity.place && ` · ${activity.place}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn soft sm"
                      aria-label={`${t("admin.rsvpSettings.editActivity")}: ${activity.name}`}
                      onClick={() => {
                        setActivityEdit({ kind: "edit", id: activity.id });
                      }}
                    >
                      {t("admin.rsvpSettings.edit")}
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={programItem.activities.length === 1}
                      aria-label={`${t("admin.rsvpSettings.deleteActivity")}: ${activity.name}`}
                      onClick={() => {
                        void run("DELETE", `${ACTIVITIES_PATH}/${String(activity.id)}`);
                      }}
                    >
                      {t("admin.rsvpSettings.delete")}
                    </button>
                  </li>
                ),
              )}
            </ul>
            {activityEdit?.kind === "add" && activityEdit.programItemId === programItem.id ? (
              <ActivityForm
                places={places}
                timeZone={format.timeZone}
                onCancel={() => {
                  setActivityEdit(undefined);
                }}
                onSubmit={async (body) => {
                  if (
                    await run(
                      "POST",
                      `${PROGRAM_ITEMS_PATH}/${String(programItem.id)}/activities`,
                      body,
                    )
                  ) {
                    setActivityEdit(undefined);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="btn ghost sm"
                aria-label={`${t("admin.rsvpSettings.addActivity")}: ${programItem.name}`}
                onClick={() => {
                  setActivityEdit({ kind: "add", programItemId: programItem.id });
                }}
              >
                {t("admin.rsvpSettings.addActivity")}
              </button>
            )}
            {programItem.activities.length === 1 && (
              <span className="hint">{t("admin.rsvpSettings.lastActivityHint")}</span>
            )}
          </li>
        ))}
      </ul>
      {confirmDelete !== undefined && (
        <span className="hint">{t("admin.rsvpSettings.deleteHint")}</span>
      )}
      {editing === "new" ? (
        <ProgramItemForm
          places={places}
          timeZone={format.timeZone}
          onCancel={() => {
            setEditing(undefined);
          }}
          onSubmit={async (item, firstActivity) => {
            if (
              firstActivity &&
              (await run("POST", PROGRAM_ITEMS_PATH, { ...item, activities: [firstActivity] }))
            ) {
              setEditing(undefined);
            }
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

      {menuSection(false)}
      {menuSection(true)}
    </section>
  );
}
