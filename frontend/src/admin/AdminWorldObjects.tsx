// Game world › Objekte & Portale (MAP-15, GAME-06; UX mock `admin-world`, variant "objects"): per map, the clickable
// objects by their Tiled name and label, with the action each one runs. The preset of the Tiled file applies until
// the admin picks something else; a change is live at once, without a new import. Portals are read-only.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { worldObjectsSchema } from "@zappaloo/shared";
import type { WorldClickable, WorldObjectAction, WorldObjects } from "@zappaloo/shared";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const OBJECTS_PATH = "/api/admin/world/objects";
/** The value of the select for "no action". */
const NO_ACTION = "none";

/** The value of the action select: the kind and the target, or "" for the preset. */
function selectValue(action: WorldObjectAction | undefined): string {
  if (action === undefined) return "";
  switch (action.kind) {
    case "page":
      return `page:${action.page}`;
    case "content":
      return `content:${action.contentId}`;
    case "dialog":
      return `dialog:${action.dialogId}`;
    case "minigame":
      return `minigame:${action.minigameId}`;
    case "none":
      return NO_ACTION;
  }
}

/** The action a select value stands for; null is the preset. */
function actionOfValue(value: string): WorldObjectAction | null {
  if (value === "") return null;
  if (value === NO_ACTION) return { kind: "none" };
  const [kind, ...rest] = value.split(":");
  const target = rest.join(":");
  if (kind === "page") return { kind: "page", page: target };
  if (kind === "content") return { kind: "content", contentId: target };
  return { kind: "dialog", dialogId: target };
}

export default function AdminWorldObjects() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const call = useAdminCall();
  const { data, failed, reload } = useAdminData(OBJECTS_PATH, worldObjectsSchema);
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

  async function assign(object: string, value: string) {
    if (!map) return;
    setError(undefined);
    setSaved(false);
    const result = await call("PUT", `${OBJECTS_PATH}/${map.id}/${object}`, {
      action: actionOfValue(value),
    });
    if (result.ok) {
      setSaved(true);
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  return (
    <>
      <div className="row" role="group" aria-label={t("admin.world.objects.maps")}>
        {data.maps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn sm ${item.id === map.id ? "soft" : "ghost"}`}
            aria-pressed={item.id === map.id}
            onClick={() => {
              setSelected(item.id);
            }}
          >
            {item.name ?? item.id}
          </button>
        ))}
      </div>
      <section className="card" aria-labelledby="objects-title">
        <b id="objects-title">{t("admin.world.objects.title", { count: map.clickables.length })}</b>
        <p className="hint">{t("admin.world.objects.info")}</p>
        {map.clickables.length === 0 ? (
          <p className="hint">{t("admin.world.objects.none")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("admin.world.objects.object")}</th>
                <th>{t("admin.world.objects.action")}</th>
              </tr>
            </thead>
            <tbody>
              {map.clickables.map((clickable) => (
                <ClickableRow
                  key={clickable.name}
                  clickable={clickable}
                  targets={data}
                  onChange={(value) => void assign(clickable.name, value)}
                />
              ))}
            </tbody>
          </table>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {saved && <p role="status">{t("admin.world.objects.saved")}</p>}
      </section>
      <section className="card" aria-labelledby="portals-title">
        <b id="portals-title">
          {t("admin.world.objects.portalsTitle", { count: map.portals.length })}
        </b>
        <p className="hint">{t("admin.world.objects.portalsInfo")}</p>
        {map.portals.length > 0 && (
          <ul>
            {map.portals.map((portal) => (
              <li key={portal.name}>
                <b>{portal.name}</b>
                {portal.targetMap !== undefined && (
                  <>
                    {" → "}
                    {portal.targetMap}
                    {portal.targetSpawn !== undefined && ` › ${portal.targetSpawn}`}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ClickableRow({
  clickable,
  targets,
  onChange,
}: {
  clickable: WorldClickable;
  targets: WorldObjects;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const actionText = (action: WorldObjectAction): string => {
    switch (action.kind) {
      case "page":
        return t("admin.world.objects.kinds.page", { target: action.page });
      case "content":
        return t("admin.world.objects.kinds.content", { target: action.contentId });
      case "dialog":
        return t("admin.world.objects.kinds.dialog", { target: action.dialogId });
      case "minigame":
        return t("admin.world.objects.kinds.minigame", { target: action.minigameId });
      case "none":
        return t("admin.world.objects.kinds.none");
    }
  };
  const preset = clickable.preset
    ? t("admin.world.objects.preset", { action: actionText(clickable.preset) })
    : t("admin.world.objects.noPreset");
  return (
    <tr>
      <td>
        <b>{clickable.label ?? clickable.name}</b>
        {clickable.label !== undefined && (
          <>
            <br />
            <span className="hint">{clickable.name}</span>
          </>
        )}
        {clickable.hidden && (
          <>
            {" "}
            <span className="tag line">{t("admin.world.objects.hidden")}</span>
          </>
        )}
      </td>
      <td>
        <select
          aria-label={t("admin.world.objects.actionOf", {
            name: clickable.label ?? clickable.name,
          })}
          value={selectValue(clickable.override)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <option value="">{preset}</option>
          <option value={NO_ACTION}>{t("admin.world.objects.kinds.none")}</option>
          <optgroup label={t("admin.world.objects.groups.page")}>
            {targets.pages.map((page) => (
              <option key={page} value={`page:${page}`}>
                {page}
              </option>
            ))}
          </optgroup>
          {targets.contentPages.length > 0 && (
            <optgroup label={t("admin.world.objects.groups.content")}>
              {targets.contentPages.map((slug) => (
                <option key={slug} value={`content:${slug}`}>
                  {slug}
                </option>
              ))}
            </optgroup>
          )}
          {targets.dialogues.length > 0 && (
            <optgroup label={t("admin.world.objects.groups.dialog")}>
              {targets.dialogues.map((id) => (
                <option key={id} value={`dialog:${id}`}>
                  {id}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {clickable.missing && <span className="tag warn">{t("admin.world.objects.missing")}</span>}
      </td>
    </tr>
  );
}
