// Game world › Objekte & Portale (MAP-15, MAP-21, GAME-06; UX mock `admin-world`, variant "objects"): one chip per
// map, a table of its clickable objects and NPCs (name, the action the admin picked, the preset of the Tiled file, the
// indicator and label) and the portals as a read-only list. An NPC is configured like an object. The select shows the
// action that applies; the preset applies until the admin picks something else, and picking the preset again returns
// to it. A change is live at once. The name and the greeting of a figure come from its dialogue.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { contentResponseSchema, worldObjectsSchema } from "@zappaloo/shared";
import type { WorldClickable, WorldNpc, WorldObjectAction, WorldObjects } from "@zappaloo/shared";
import ActionSelect from "./ActionSelect.tsx";
import { actionOfValue, selectValue } from "./world-actions.ts";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";

const OBJECTS_PATH = "/api/admin/world/objects";
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
  /** The clickable objects and the NPCs of the map in one table: an NPC is configured like an object (MAP-21). */
  const rows: ObjectRow[] = [
    ...map.clickables.map((item) => ({ ...item, npc: false })),
    ...map.npcs.map((item: WorldNpc) => ({ ...item, hidden: false, npc: true })),
  ];

  /** The name of a page: the built-in ones by their navigation names, a content page by its title. */
  const pageName = (page: string): string => {
    if (page === "programme") return t("nav.programme");
    if (page === "seating") return t("seating.title");
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

  /** Assigns an action to a clickable object or an NPC: picking what the preset says returns to the preset. */
  async function assign(clickable: Pick<ObjectRow, "name" | "preset">, value: string) {
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

  /** Turns the edge indicator and the label of an object or NPC on or off; live at once (GAME-26, GAME-41). */
  async function setIndicator(name: string, showIndicator: boolean) {
    setError(undefined);
    setSaved(false);
    setSaving(name);
    try {
      const path = `${OBJECTS_PATH}/${encodeURIComponent(map?.id ?? "")}/${encodeURIComponent(name)}/indicator`;
      const result = await call("PUT", path, { showIndicator });
      const parsed = worldObjectsSchema.safeParse(result.body);
      if (result.ok && parsed.success) {
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
            {t("admin.world.objects.title", { count: rows.length })}
          </b>
          <span className="hint">{t("admin.world.objects.info")}</span>
        </div>
        {rows.length === 0 ? (
          <p className="hint tight-foot">{t("admin.world.objects.none")}</p>
        ) : (
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.world.objects.object")}</th>
                  <th>{t("admin.world.objects.action")}</th>
                  <th>{t("admin.world.objects.presetColumn")}</th>
                  <th>{t("admin.world.objects.indicatorColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((clickable) => (
                  <ClickableRow
                    key={clickable.name}
                    clickable={clickable}
                    targets={data}
                    actionName={actionName}
                    busy={saving === clickable.name}
                    onChange={(value) => void assign(clickable, value)}
                    onIndicator={(show) => void setIndicator(clickable.name, show)}
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

/** A row of the table: a clickable object, or an NPC (which is never a Easter egg). */
type ObjectRow = (WorldClickable | (WorldNpc & { hidden: boolean })) & { npc: boolean };

function ClickableRow({
  clickable,
  targets,
  actionName,
  busy,
  onChange,
  onIndicator,
}: {
  clickable: ObjectRow;
  targets: WorldObjects;
  actionName: (action: WorldObjectAction | undefined) => string;
  busy: boolean;
  onChange: (value: string) => void;
  onIndicator: (show: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr>
      <td>
        <b>{clickable.label ?? clickable.name}</b>
        <br />
        <span className="hint">{clickable.name}</span>
        {clickable.npc && (
          <>
            {" "}
            <span className="tag">{t("admin.world.objects.npc")}</span>
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
        <ActionSelect
          ariaLabel={t("admin.world.objects.actionOf", {
            name: clickable.label ?? clickable.name,
          })}
          preset={clickable.preset}
          effective={clickable.override ?? clickable.preset}
          targets={targets}
          actionName={actionName}
          busy={busy}
          onChange={onChange}
        />
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
      <td>
        <input
          type="checkbox"
          checked={clickable.showIndicator}
          disabled={busy}
          aria-label={t("admin.world.objects.indicatorOf", {
            name: clickable.label ?? clickable.name,
          })}
          onChange={(event) => {
            onIndicator(event.target.checked);
          }}
        />
      </td>
    </tr>
  );
}
