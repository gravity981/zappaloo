// Game world › Welt & Import (MAP-05, MAP-06, MAP-08, MAP-09; sw-architecture.md 14.4; UX mock
// `admin-world`, variant "import"): the active world, the import of a world package as a whole, the
// findings of a refused package, the warnings of an accepted one, the maps, and the return to the
// previous world after a second click. Only admins use this page; the server refuses everyone else.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { worldRefusalSchema, worldStatusSchema } from "@zappaloo/shared";
import type { WorldFindingDto, WorldStatus } from "@zappaloo/shared";
import { apiRequest } from "../app/api.ts";
import { useSession } from "../app/session.ts";
import { useEventFormat } from "../rsvp/format.ts";
import AdminWorldObjects from "./AdminWorldObjects.tsx";
import { useAdminData, useErrorText } from "./data.ts";
import { Switch } from "./ui.tsx";

const WORLD_PATH = "/api/admin/world";
const WORLD_MEDIA_TYPE = "application/vnd.zappaloo.world";

/** One finding as the server gives it: the file, the map object if any, and the reason in English. */
function findingText(finding: WorldFindingDto): string {
  const place = finding.object === undefined ? finding.file : `${finding.file} › ${finding.object}`;
  // The severity comes first, as the command line prints it: "error: " refuses the package, "warning: " does not.
  return `${finding.severity}: ${place}: ${finding.detail}`;
}

export default function AdminWorldPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"objects" | "import">("import");
  const tabs = [
    ["objects", t("admin.world.tabObjects")],
    ["import", t("admin.world.tabImport")],
  ] as const;
  return (
    <>
      <div className="row">
        <h1 className="grow">{t("admin.nav.world")}</h1>
      </div>
      <div className="subtabs" role="group" aria-label={t("admin.world.tabs")}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "objects" ? <AdminWorldObjects /> : <WorldCard />}
    </>
  );
}

function WorldCard() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { csrfToken } = useSession();
  const { data, failed, reload } = useAdminData(WORLD_PATH, worldStatusSchema);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [findings, setFindings] = useState<WorldFindingDto[]>();
  /** The return to the previous world waits for the second click. */
  const [armed, setArmed] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    setFindings(undefined);
    // The server reads a package only with its own media type; the browser may name the file differently.
    const archive = new Blob([file], { type: WORLD_MEDIA_TYPE });
    const result = await apiRequest("POST", WORLD_PATH, { csrfToken, raw: archive });
    setBusy(false);
    if (result.ok) {
      setSaved(t("admin.world.imported"));
      reload();
      return;
    }
    const refusal = worldRefusalSchema.safeParse(result.body);
    if (result.status === 422 && refusal.success) {
      setFindings(refusal.data.findings);
      return;
    }
    setError(errorText(result.errorCode));
  }

  /** Guest access to the world (MAP-19): the switch is live at once; the active world stays either way. */
  async function setGuestAccess(enabled: boolean) {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    const result = await apiRequest("PUT", `${WORLD_PATH}/guest-access`, {
      csrfToken,
      body: { enabled },
    });
    setBusy(false);
    if (result.ok) reload();
    else setError(errorText(result.errorCode));
  }

  async function rollback() {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    setFindings(undefined);
    const result = await apiRequest("POST", `${WORLD_PATH}/rollback`, { csrfToken });
    setBusy(false);
    setArmed(false);
    if (result.ok) {
      setSaved(t("admin.world.rolledBack"));
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  if (failed) {
    return (
      <section className="card" aria-labelledby="world-title">
        <b id="world-title">{t("admin.world.title")}</b>
        <p className="error">{errorText(failed)}</p>
      </section>
    );
  }
  if (!data) return null;
  return (
    <>
      <WorldSummary
        status={data}
        busy={busy}
        armed={armed}
        onArm={setArmed}
        onRollback={() => void rollback()}
        onGuestAccess={(enabled) => void setGuestAccess(enabled)}
        onImport={(file) => void importFile(file)}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
      {findings && (
        <section className="card" aria-labelledby="refused-title">
          <b id="refused-title">{t("admin.world.refusedTitle")}</b>
          <p className="hint">{t("admin.world.refusedInfo")}</p>
          <ul>
            {findings.map((finding, index) => (
              <li key={index}>{findingText(finding)}</li>
            ))}
          </ul>
        </section>
      )}
      {data.active && data.active.warnings.length > 0 && (
        <section className="card" aria-labelledby="warnings-title">
          <b id="warnings-title">
            {t("admin.world.warningsTitle", { count: data.active.warnings.length })}
          </b>
          <p className="hint">{t("admin.world.warningsInfo")}</p>
          <ul>
            {data.active.warnings.map((warning, index) => (
              <li key={index}>{findingText(warning)}</li>
            ))}
          </ul>
        </section>
      )}
      {data.active && (
        <section className="card tight" aria-labelledby="maps-title">
          <div className="row tight-head">
            <b id="maps-title" className="grow">
              {t("admin.world.mapsTitle", { count: data.active.maps.length })}
            </b>
            <span className="hint">{t("admin.world.startHint")}</span>
          </div>
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.world.mapColumn")}</th>
                  <th>{t("admin.world.objectsColumn")}</th>
                  <th>{t("admin.world.portalsColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {data.active.maps.map((map) => (
                  <tr key={map.id}>
                    <td>
                      {map.id === data.active?.startMap && (
                        <span className="tag ok">{t("admin.world.startMarker")}</span>
                      )}{" "}
                      <b>{map.name ?? map.id}</b>
                      {map.name !== undefined && (
                        <>
                          <br />
                          <span className="hint">{map.id}</span>
                        </>
                      )}
                    </td>
                    <td>{map.clickable}</td>
                    <td>{map.portals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/** The active world (or the empty state), with its import and rollback buttons. */
function WorldSummary({
  status,
  busy,
  armed,
  onArm,
  onRollback,
  onGuestAccess,
  onImport,
}: {
  status: WorldStatus;
  busy: boolean;
  armed: boolean;
  onArm: (armed: boolean) => void;
  onRollback: () => void;
  onGuestAccess: (enabled: boolean) => void;
  onImport: (file: File) => void;
}) {
  const { t } = useTranslation();
  const format = useEventFormat();
  const active = status.active;
  const previous = status.previous;
  return (
    <section className="card" aria-labelledby="world-title">
      <div className="row">
        <b id="world-title" className="grow">
          {t("admin.world.title")}
        </b>
        {active ? (
          <span className="tag ok">{t("admin.world.activeTag", { name: active.name })}</span>
        ) : (
          <span className="tag line">{t("admin.world.noneTag")}</span>
        )}
      </div>
      {active ? (
        <span className="hint">
          {t("admin.world.info", {
            version: active.formatVersion,
            width: active.tileWidth,
            height: active.tileHeight,
            figures: active.figures,
            date: format.date(active.importedAt),
            time: format.time(active.importedAt),
            start: active.startMap,
          })}
        </span>
      ) : (
        <span className="hint">{t("admin.world.noneInfo")}</span>
      )}
      {previous && (
        <span className="hint">
          {t("admin.world.previous", {
            name: previous.name,
            date: format.date(previous.importedAt),
            time: format.time(previous.importedAt),
          })}
        </span>
      )}
      {active && (
        <div className="setrow">
          <div className="grow">
            <b className="sm">{t("admin.world.guestAccess")}</b>
            <span className="hint">
              {t(status.guestAccess ? "admin.world.guestAccessOn" : "admin.world.guestAccessOff")}
            </span>
          </div>
          <Switch
            checked={status.guestAccess}
            label={t("admin.world.guestAccess")}
            disabled={busy}
            onChange={onGuestAccess}
          />
        </div>
      )}
      <div className="row">
        <label className="btn soft sm">
          {busy ? t("admin.world.importing") : t("admin.world.importButton")}
          <input
            type="file"
            accept=".tar.gz,application/gzip"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImport(file);
            }}
          />
        </label>
        {previous && !armed && (
          <button
            type="button"
            className="btn ghost sm"
            disabled={busy}
            onClick={() => {
              onArm(true);
            }}
          >
            {t("admin.world.rollbackButton")}
          </button>
        )}
      </div>
      {previous && armed && (
        <div className="row">
          <span className="hint">
            {t("admin.world.rollbackConfirm", {
              name: previous.name,
              date: format.date(previous.importedAt),
              time: format.time(previous.importedAt),
            })}
          </span>
          <button type="button" className="btn soft sm" disabled={busy} onClick={onRollback}>
            {t("admin.world.rollbackYes")}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              onArm(false);
            }}
          >
            {t("admin.world.cancel")}
          </button>
        </div>
      )}
    </section>
  );
}
