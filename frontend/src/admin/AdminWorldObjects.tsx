// Game world › Objekte & Portale (MAP-15, GAME-06; UX mock `admin-world`, variant "objects"): one chip per map,
// a table of its clickable objects (name, the action the admin picked, the preset of the Tiled file) and the
// portals as a read-only list. The select shows the action that applies; the preset applies until the admin
// picks something else, and picking the preset again returns to it. A change is live at once.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { contentResponseSchema, worldObjectsSchema } from "@zappaloo/shared";
import type { WorldClickable, WorldObjectAction, WorldObjects } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const OBJECTS_PATH = "/api/admin/world/objects";
/** The value of the select for "no action". */
const NO_ACTION = "none";
const NONE_ACTION: WorldObjectAction = { kind: "none" };

/** The value of the select for an action. */
function selectValue(action: WorldObjectAction | undefined): string {
  if (action === undefined) return NO_ACTION;
  switch (action.kind) {
    case "page":
      return `page:${action.page}`;
    case "dialog":
      return `dialog:${action.dialogId}`;
    case "minigame":
      return `minigame:${action.minigameId}`;
    case "none":
      return NO_ACTION;
  }
}

/** The action a select value stands for. */
function actionOfValue(value: string): WorldObjectAction {
  if (value === NO_ACTION) return NONE_ACTION;
  const [kind, ...rest] = value.split(":");
  const target = rest.join(":");
  if (kind === "page") return { kind: "page", page: target };
  return { kind: "dialog", dialogId: target };
}

export default function AdminWorldObjects() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const call = useAdminCall();
  const { data, failed, replace } = useAdminData(OBJECTS_PATH, worldObjectsSchema);
  /** The object whose action is being saved: its select waits, so a second change does not race the first. */
  const [saving, setSaving] = useState<string>();
  // The titles of the content pages name them in the select (the mock shows «Seite: Anreise & Parkieren»).
  const content = useAdminData("/api/content", contentResponseSchema).data;
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  if (failed) {
    return (
      <p role="alert" className="error">
        {errorText(failed)}
      </p>
    );
  }
  if (!data) return null;
  if (data.maps.length === 0) {
    return (
      <section className="card">
        <p className="hint">{t("admin.world.objects.noWorld")}</p>
      </section>
    );
  }
  const map = data.maps.find((item) => item.id === selected) ?? data.maps[0];
  if (!map) return null;
  const mapName = (id: string) => data.maps.find((item) => item.id === id)?.name ?? id;

  /** The name of a page: the built-in ones by their navigation names, a content page by its title. */
  const pageName = (page: string): string => {
    if (page === "programme") return t("nav.programme");
    if (page === "rsvp") return t("nav.rsvp");
    if (page === "profile") return t("nav.profile");
    const slug = page.startsWith("p/") ? page.slice(2) : page;
    return content?.pages.find((item) => item.slug === slug)?.title ?? page;
  };
  /** «Seite: Programm», «Dialog: pfarrer», «Minispiel: quiz-01», «– keine –». */
  const actionName = (action: WorldObjectAction | undefined): string => {
    switch (action?.kind) {
      case "page":
        return t("admin.world.objects.kinds.page", { target: pageName(action.page) });
      case "dialog":
        return t("admin.world.objects.kinds.dialog", { target: action.dialogId });
      case "minigame":
        return t("admin.world.objects.kinds.minigame", { target: action.minigameId });
      default:
        return t("admin.world.objects.kinds.none");
    }
  };

  async function assign(clickable: WorldClickable, value: string) {
    setError(undefined);
    setSaved(false);
    const candidate = actionOfValue(value);
    // Picking what the preset says returns to the preset: the assignment is removed.
    const preset = selectValue(clickable.preset);
    const body = { action: selectValue(candidate) === preset ? null : candidate };
    setSaving(clickable.name);
    try {
      const path = `${OBJECTS_PATH}/${encodeURIComponent(map?.id ?? "")}/${encodeURIComponent(clickable.name)}`;
      const result = await call("PUT", path, body);
      const parsed = worldObjectsSchema.safeParse(result.body);
      if (result.ok && parsed.success) {
        // The answer is the list as it is now: no second request is needed.
        setSaved(true);
        replace(parsed.data);
      } else {
        setError(errorText(result.errorCode));
      }
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <>
      <div className="chips" role="group" aria-label={t("admin.world.objects.maps")}>
        {data.maps.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chip"
            aria-pressed={item.id === map.id}
            onClick={() => {
              setSelected(item.id);
            }}
          >
            {item.name ?? item.id}
            {item.id === data.startMap && ` ${t("admin.world.startMarker")}`}
          </button>
        ))}
      </div>
      <section className="card tight" aria-labelledby="objects-title">
        <div className="row tight-head">
          <b id="objects-title" className="grow">
            {t("admin.world.objects.title", { count: map.clickables.length })}
          </b>
          <span className="hint">{t("admin.world.objects.info")}</span>
        </div>
        {map.clickables.length === 0 ? (
          <p className="hint tight-foot">{t("admin.world.objects.none")}</p>
        ) : (
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.world.objects.object")}</th>
                  <th>{t("admin.world.objects.action")}</th>
                  <th>{t("admin.world.objects.presetColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {map.clickables.map((clickable) => (
                  <ClickableRow
                    key={clickable.name}
                    clickable={clickable}
                    targets={data}
                    actionName={actionName}
                    busy={saving === clickable.name}
                    onChange={(value) => void assign(clickable, value)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p role="alert" className="error tight-foot">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="hint tight-foot">
            {t("admin.world.objects.saved")}
          </p>
        )}
      </section>
      <section className="card" aria-labelledby="portals-title">
        <b id="portals-title">
          {t("admin.world.objects.portalsTitle", { count: map.portals.length })}
        </b>
        {map.portals.length > 0 && (
          <div className="list">
            {map.portals.map((portal) => (
              <div key={portal.name} className="li">
                <div className="grow">
                  <b>{portal.name}</b>
                  {portal.targetMap !== undefined && (
                    <span className="hint">
                      {t("admin.world.objects.portalTarget", {
                        map: mapName(portal.targetMap),
                        spawn: portal.targetSpawn ?? "start",
                      })}
                    </span>
                  )}
                </div>
                <span className="tag">{t("admin.world.objects.inTiled")}</span>
              </div>
            ))}
          </div>
        )}
        <span className="hint">{t("admin.world.objects.portalsInfo")}</span>
      </section>
    </>
  );
}

function ClickableRow({
  clickable,
  targets,
  actionName,
  busy,
  onChange,
}: {
  clickable: WorldClickable;
  targets: WorldObjects;
  actionName: (action: WorldObjectAction | undefined) => string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const effective = clickable.override ?? clickable.preset;
  const options = [
    ...targets.pages.map((page) => `page:${page}`),
    ...targets.dialogues.map((id) => `dialog:${id}`),
    // A preset can name a minigame, which an admin cannot assign (stage 8): it is listed so it can be shown.
    ...(clickable.preset?.kind === "minigame" ? [selectValue(clickable.preset)] : []),
  ];
  // The select shows the action that applies; a target that does not exist shows as «– keine –» (the preset
  // column says what is missing).
  const shown = selectValue(effective);
  const value = options.includes(shown) ? shown : NO_ACTION;
  const label = (option: string): string => {
    const [kind, ...rest] = option.split(":");
    const target = rest.join(":");
    if (kind === "page") return actionName({ kind: "page", page: target });
    if (kind === "dialog") return actionName({ kind: "dialog", dialogId: target });
    return actionName({ kind: "minigame", minigameId: target });
  };
  return (
    <tr>
      <td>
        <b>{clickable.label ?? clickable.name}</b>
        <br />
        <span className="hint">{clickable.name}</span>
        {clickable.hidden && (
          <>
            {" "}
            <span className="tag line">{t("admin.world.objects.hidden")}</span>
          </>
        )}
      </td>
      <td>
        <select
          className="input auto"
          aria-label={t("admin.world.objects.actionOf", {
            name: clickable.label ?? clickable.name,
          })}
          value={value}
          disabled={busy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {label(option)}
            </option>
          ))}
          <option value={NO_ACTION}>{actionName(NONE_ACTION)}</option>
        </select>
      </td>
      <td className="muted sm">
        {clickable.preset === undefined ? (
          "–"
        ) : (
          <>
            {actionName(clickable.preset)}
            {clickable.missing && (
              <>
                {" "}
                <span className="tag warn">{t("admin.world.objects.missing")}</span>
              </>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
